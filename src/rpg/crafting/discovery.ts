// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// size-allow: 270

/**
 * Recipe Discovery Service — consumer of the `recipe_discoveries` table.
 *
 * A character "knows" a recipe when either
 *   - the recipe row is flagged `discovered_by_default` (common knowledge), or
 *   - a `recipe_discoveries` row exists for the (actor, recipe) pair — the
 *     table is UNIQUE on that pair, so knowledge is a single row.
 *
 * Discovery sources (EPIC-036 §Recipe Discovery) handled here:
 *   - **Experimentation** — recorded by `CraftingProcessService.attemptCraft`
 *     inside the craft transaction when an `experiment` attempt succeeds.
 *   - **Recipe books / NPC teaching / quest rewards / world discovery /
 *     starting kit** — recorded via `DiscoveryService.recordDiscovery`; the
 *     caller supplies the method.
 *
 * Every fresh discovery fans the `crafting.recipe_discovered` contract event
 * out to plugin handlers (declared in `src/rpg/integration-registry/edges`,
 * emitting → character_core).
 */

import type { Kysely, Selectable, } from "kysely";
import type { DiscoveryMethod, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import type { RecipeDiscoveries, } from "../../db/schema-crafting";
import { getLogger, } from "../../logger";
import { emitPluginEvent, } from "../../plugins/event-bus";
import { registry, } from "../../plugins/registry";
import { uid, } from "../../utils";
import type {
  DiscoveredRecipe,
  RecipeDiscovery,
  RecordDiscoveryOpts,
} from "./types";

/** Payload of the `crafting.recipe_discovered` contract event. */
export interface RecipeDiscoveredPayload {
  actorId: string;
  worldId: string;
  recipeId: string;
  method: DiscoveryMethod;
  discoveredAt: string;
}

/**
 * Map a `recipe_discoveries` row to the service-level {@link RecipeDiscovery}.
 * @param r
 */
function toDiscovery(r: Selectable<RecipeDiscoveries>,): RecipeDiscovery {
  return {
    id: r.id,
    actorId: r.actor_id,
    worldId: r.world_id,
    recipeId: r.recipe_id,
    discoveryMethod: r.discovery_method,
    discoveredAt: r.discovered_at,
    masteryLevel: r.mastery_level,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/**
 * Whether a discovery row exists for the actor+recipe pair.
 * @param db
 * @param actorId
 * @param recipeId
 * @returns true when the actor has an explicit discovery row
 */
export async function hasDiscovery(
  db: Kysely<DB>,
  actorId: string,
  recipeId: string,
): Promise<boolean> {
  const row = await db.selectFrom("recipe_discoveries",)
    .select("id",)
    .where("actor_id", "=", actorId,)
    .where("recipe_id", "=", recipeId,)
    .executeTakeFirst();

  return row !== undefined;
}

/**
 * Get the actor's discovery row for a recipe, if any.
 * @param db
 * @param actorId
 * @param recipeId
 * @returns the discovery row, or null when the actor has not discovered it
 */
export async function getDiscovery(
  db: Kysely<DB>,
  actorId: string,
  recipeId: string,
): Promise<RecipeDiscovery | null> {
  const row = await db.selectFrom("recipe_discoveries",).selectAll()
    .where("actor_id", "=", actorId,)
    .where("recipe_id", "=", recipeId,)
    .executeTakeFirst();

  return row ? toDiscovery(row,) : null;
}

/**
 * Insert one discovery row. Returns the created row, or null when the actor
 * already knows the recipe — `recipe_discoveries` is UNIQUE on
 * (actor_id, recipe_id), so a lost insert race reads back as "already known"
 * instead of throwing. Accepts a transaction handle.
 * @param db
 * @param opts
 * @returns the new discovery row, or null when the actor already knew the recipe
 * @throws {unknown} the insert failed for a reason other than a lost uniqueness race
 */
export async function insertDiscovery(
  db: Kysely<DB>,
  opts: RecordDiscoveryOpts,
): Promise<RecipeDiscovery | null> {
  const existing = await getDiscovery(db, opts.actorId, opts.recipeId,);
  if (existing) { return null; }

  const id = uid();
  const discoveredAt = opts.discoveredAt ?? new Date().toISOString();
  try {
    await db.insertInto("recipe_discoveries",).values({
      id,
      actor_id: opts.actorId,
      world_id: opts.worldId,
      recipe_id: opts.recipeId,
      discovery_method: opts.method,
      discovered_at: discoveredAt,
      mastery_level: opts.masteryLevel ?? 0,
    },).execute();
  } catch (error) {
    // Concurrent discovery lost against the unique constraint.
    if (await hasDiscovery(db, opts.actorId, opts.recipeId,)) { return null; }
    throw error;
  }

  return {
    id,
    actorId: opts.actorId,
    worldId: opts.worldId,
    recipeId: opts.recipeId,
    discoveryMethod: opts.method,
    discoveredAt,
    masteryLevel: opts.masteryLevel ?? 0,
    createdAt: null,
    updatedAt: null,
  };
}

/**
 * Fan `crafting.recipe_discovered` out to plugin handlers and the log.
 * Handler errors are isolated inside `emitPluginEvent` and never propagate;
 * logging is skipped when the logger is not initialized (unit tests).
 * @param payload
 * @returns nothing; handlers and the log are notified in place
 */
export async function emitRecipeDiscovered(
  payload: RecipeDiscoveredPayload,
): Promise<void> {
  await emitPluginEvent(registry.getAllEventHandlers(), "crafting.recipe_discovered", payload,);
  try {
    getLogger().child({ module: "crafting-discovery", },).info("Recipe discovered", { ...payload, },);
  } catch {
    // Logger not initialized — skip structured logging.
  }
}

/** Read/write access to a character's recipe knowledge. */
export class DiscoveryService {
  /**
   * @param db
   */
  constructor(private readonly db: Kysely<DB>,) {}

  /**
   * Whether the actor has discovered the recipe. Recipes flagged
   * `discovered_by_default` are known without a row — check the recipe flag
   * for the full "may craft" answer (see `CraftingProcessService`).
   * @param actorId
   * @param recipeId
   * @returns true when a discovery row exists for this pair
   */
  async hasDiscovered(actorId: string, recipeId: string,): Promise<boolean> {
    return hasDiscovery(this.db, actorId, recipeId,);
  }

  /**
   * Get one discovery row.
   * @param actorId
   * @param recipeId
   * @returns the discovery row, or null when the actor has not discovered it
   */
  async get(actorId: string, recipeId: string,): Promise<RecipeDiscovery | null> {
    return getDiscovery(this.db, actorId, recipeId,);
  }

  /**
   * Record a discovery made outside the craft process (recipe book, NPC
   * teacher, quest reward, …). Idempotent per (actor, recipe): an
   * already-known recipe returns the existing row with `created: false` and
   * emits no event.
   * @param opts
   * @throws {Error} When the discovery record vanished before read-back.
   * @returns the discovery row and whether this call is what created it
   */
  async recordDiscovery(
    opts: RecordDiscoveryOpts,
  ): Promise<{ discovery: RecipeDiscovery; created: boolean }> {
    const created = await insertDiscovery(this.db, opts,);
    if (created) {
      await emitRecipeDiscovered({
        actorId: opts.actorId,
        worldId: opts.worldId,
        recipeId: opts.recipeId,
        method: opts.method,
        discoveredAt: created.discoveredAt,
      },);

      return { discovery: created, created: true, };
    }

    const existing = await getDiscovery(this.db, opts.actorId, opts.recipeId,);
    if (!existing) {
      throw new Error(`Discovery record missing for recipe: ${opts.recipeId}`,);
    }

    return { discovery: existing, created: false, };
  }

  /**
   * List the recipes an actor has discovered in a world, newest first,
   * joined with the recipe's name/discipline/tier.
   * @param actorId
   * @param worldId
   * @returns the actor's discovered recipes with their name, discipline and tier
   */
  async listDiscovered(actorId: string, worldId: string,): Promise<DiscoveredRecipe[]> {
    const rows = await this.db
      .selectFrom("recipe_discoveries as rd",)
      .innerJoin("crafting_recipes as cr", "cr.id", "rd.recipe_id",)
      .select([
        "rd.id as id",
        "rd.actor_id as actor_id",
        "rd.world_id as world_id",
        "rd.recipe_id as recipe_id",
        "rd.discovery_method as discovery_method",
        "rd.discovered_at as discovered_at",
        "rd.mastery_level as mastery_level",
        "rd.created_at as created_at",
        "rd.updated_at as updated_at",
        "cr.name as recipe_name",
        "cr.discipline as discipline",
        "cr.tier as tier",
      ],)
      .where("rd.actor_id", "=", actorId,)
      .where("rd.world_id", "=", worldId,)
      .orderBy("rd.discovered_at", "desc",)
      .execute();

    return Array.from(rows, (r,) => ({
      id: r.id,
      actorId: r.actor_id,
      worldId: r.world_id,
      recipeId: r.recipe_id,
      discoveryMethod: r.discovery_method,
      discoveredAt: r.discovered_at,
      masteryLevel: r.mastery_level,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      recipeName: r.recipe_name,
      discipline: r.discipline,
      tier: r.tier,
    }),);
  }
}
