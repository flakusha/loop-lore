// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Outfit resolution — the context half of the selection ladder.
 *
 * Precedence (deterministic, documented): chat/scene override >
 * location/world rule > equipped-loadout bridge (flag-gated, default
 * off) > character default outfit > none (null = base
 * behavior, i.e. today's emotion-only selection).
 *
 * The character default outfit reuses the pre-existing `actors.outfits`
 * JSON catalog + `actors.default_outfit` seam: catalog outfits are
 * materialized into `wardrobe_items` on first resolution so avatar rows
 * and overrides have a stable FK target.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { jsonParseOr, jsonStringifyOr, } from "../../../utils";
import { isLoadoutBridgeEnabled, resolveEquippedOutfit, } from "./loadout-bridge";
import type { OutfitResolutionContext, ResolvedOutfit, } from "./types";

interface CatalogOutfit {
  id: string;
  name: string;
  descriptor?: string;
  tags?: string[];
}

/**
 * Materialize a catalog outfit (actors.outfits) into wardrobe_items.
 * Idempotent: keyed by `${actorId}:${catalogId}`.
 * @param db
 * @param actorId
 * @param catalogId
 * @returns void
 */
async function ensureCatalogOutfit(
  db: Kysely<DB>,
  actorId: string,
  catalogId: string,
): Promise<string | null> {
  const materializedId = `${actorId}:${catalogId}`;
  const existing = await db
    .selectFrom("wardrobe_items",)
    .select(["id",],)
    .where("id", "=", materializedId,)
    .executeTakeFirst();

  if (existing) { return existing.id; }

  const actor = await db
    .selectFrom("actors",)
    .select(["outfits",],)
    .where("id", "=", actorId,)
    .executeTakeFirst();

  if (!actor?.outfits) { return null; }

  const catalog = jsonParseOr<CatalogOutfit[]>(actor.outfits, [],);
  const entry = catalog.find((o,) => o?.id === catalogId);
  if (!entry) { return null; }

  const now = new Date().toISOString();
  await db
    .insertInto("wardrobe_items",)
    .values({
      id: materializedId,
      actor_id: actorId,
      world_id: null,
      name: entry.name,
      descriptor: entry.descriptor ?? "",
      tags: jsonStringifyOr(entry.tags ?? [], "[]",),
      sort_order: 0,
      created_at: now,
      updated_at: now,
    },)
    // The SELECT above and this INSERT are not atomic: two concurrent
    // readers of the same actor (e.g. two GETs of one message page) can both
    // miss and both insert. Materializing is idempotent, so the loser of the
    // race discards its row and reuses the winner's id.
    .onConflict((oc,) => oc.column("id",).doNothing())
    .execute();

  return materializedId;
}

/**
 * Resolve the character default outfit (ladder rung 3 input).
 * Accepts either a wardrobe_items id or an actors.outfits catalog id.
 * @param db
 * @param actorId
 * @returns void
 */
export async function resolveDefaultOutfit(
  db: Kysely<DB>,
  actorId: string,
): Promise<string | null> {
  const actor = await db
    .selectFrom("actors",)
    .select(["default_outfit",],)
    .where("id", "=", actorId,)
    .executeTakeFirst();

  const ref = actor?.default_outfit;
  if (!ref) { return null; }

  const direct = await db
    .selectFrom("wardrobe_items",)
    .select(["id",],)
    .where("id", "=", ref,)
    .where((eb,) => eb.or([eb("actor_id", "=", actorId,), eb("actor_id", "is", null,),],))
    .executeTakeFirst();

  if (direct) { return direct.id; }

  return ensureCatalogOutfit(db, actorId, ref,);
}

/**
 * Ladder rung 2: the world/location outfit rule. `outfit_bindings` is
 * free-form JSON with no FK (migration 031), so dangling, non-string or
 * foreign-actor outfit ids are storable — the mapped value is type-checked
 * and the `wardrobe_items` row verified (owned by the actor, or an
 * actor-less world template of this world) before the rule wins. Anything
 * invalid returns null and the ladder falls through (bridge → default → none).
 * @param db
 * @param ctx
 */
async function resolveLocationRuleOutfit(
  db: Kysely<DB>,
  ctx: OutfitResolutionContext,
): Promise<ResolvedOutfit | null> {
  if (!ctx.worldId || !ctx.locationId) { return null; }

  // Local const: property narrowing does not survive into the where
  // callback below.
  const worldId = ctx.worldId;

  const config = await db
    .selectFrom("world_avatar_config",)
    .select(["outfit_bindings",],)
    .where("world_id", "=", worldId,)
    .where("actor_id", "=", ctx.actorId,)
    .executeTakeFirst();

  const bindings = config?.outfit_bindings
    ? jsonParseOr<Record<string, string>>(config.outfit_bindings, {},)
    : {};

  const mapped = bindings[ctx.locationId];
  if (typeof mapped !== "string") { return null; }

  // Mirrors the write-side guard in setLocationOutfitBindings: another
  // actor's outfit never wins the rule, even when scoped to this world.
  const item = await db
    .selectFrom("wardrobe_items",)
    .select(["id",],)
    .where("id", "=", mapped,)
    .where((eb,) =>
      eb.or([
        eb("actor_id", "=", ctx.actorId,),
        eb.and([eb("actor_id", "is", null,), eb("world_id", "=", worldId,),],),
      ],)
    )
    .executeTakeFirst();

  return item ? { outfitId: item.id, source: "location_rule", } : null;
}

/**
 * Resolve the active outfit for one actor in one context.
 * Precedence: chat override > location/world rule > character default.
 * @param db
 * @param ctx
 * @returns void
 */
export async function resolveOutfit(
  db: Kysely<DB>,
  ctx: OutfitResolutionContext,
): Promise<ResolvedOutfit> {
  if (ctx.chatId) {
    const override = await db
      .selectFrom("chat_wardrobe_overrides",)
      .select(["outfit_id",],)
      .where("chat_id", "=", ctx.chatId,)
      .where("actor_id", "=", ctx.actorId,)
      .executeTakeFirst();

    if (override) { return { outfitId: override.outfit_id, source: "chat_override", }; }
  }

  const locationRule = await resolveLocationRuleOutfit(db, ctx,);
  if (locationRule) { return locationRule; }

  // Rung 3 (flag-gated): equipped-items → outfit loadout bridge.
  // Off (default) = manual behavior preserved: fall straight to default.
  if (await isLoadoutBridgeEnabled(db,)) {
    const equipped = await resolveEquippedOutfit(db, ctx.actorId,);
    if (equipped) { return { outfitId: equipped, source: "equipped_loadout", }; }
  }

  const defaultOutfit = await resolveDefaultOutfit(db, ctx.actorId,);
  if (defaultOutfit) { return { outfitId: defaultOutfit, source: "default", }; }

  return { outfitId: null, source: "none", };
}
