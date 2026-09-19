// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import { ContentIntensity, } from "../../../db/enums-character/nsfw";
import type { DB, } from "../../../db/schema";
import { getLogger, } from "../../../logger";
import { AROUSAL_CEILING, } from "../../../schemas";
import { jsonStringifyOr, uid, } from "../../../utils";
import { rowToArousal, } from "./helpers";
import type { ArousalModifier, ArousalState, } from "./types";

/**
 * Get or create arousal state for an actor.
 * @param db
 * @param actorId
 * @param worldId
 */
export async function getArousal(
  db: Kysely<DB>,
  actorId: string,
  worldId: string | null = null,
): Promise<ArousalState> {
  const row = await db
    .selectFrom("character_arousal",)
    .where("actor_id", "=", actorId,)
    .where("world_id", "is", worldId,)
    .selectAll()
    .executeTakeFirst();

  if (row) {
    return rowToArousal(row,);
  }

  // Create default state
  const now = new Date().toISOString();
  const id = uid();

  await db
    .insertInto("character_arousal",)
    .values({
      id,
      actor_id: actorId,
      world_id: worldId,
      level: 0,
      buildup_rate: 1,
      decay_rate: 1,
      modifiers: "[]",
      last_update: now,
      created_at: now,
      updated_at: now,
    },)
    .execute();

  return {
    id,
    actorId,
    worldId,
    level: 0,
    buildupRate: 1,
    decayRate: 1,
    modifiers: [],
    lastUpdate: now,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Modify arousal level for an actor.
 * @param db
 * @param actorId
 * @param delta - Arousal change (positive = increase, negative = decrease).
 * @param worldId
 * @param source
 * @param intensityTier - Content-intensity tier bounding the ceiling
 *   (defaults to Moderate); deltas clamp at AROUSAL_CEILING[tier]
 *   (TASK-034).
 * @returns New arousal level.
 */
export async function modifyArousal(
  db: Kysely<DB>,
  actorId: string,
  delta: number,
  worldId: string | null = null,
  source?: string,
  intensityTier?: ContentIntensity,
): Promise<number> {
  const state = await getArousal(db, actorId, worldId,);

  // Apply modifiers
  let modifiedDelta = delta * state.buildupRate;
  for (const mod of state.modifiers) {
    modifiedDelta *= mod.multiplier;
  }

  // Arousal ceiling (TASK-034): deltas clamp at the tier ceiling after
  // buildup/decay multipliers, so the check reflects persisted state.
  const ceiling = AROUSAL_CEILING[intensityTier ?? ContentIntensity.Moderate];
  const newLevel = Math.max(0, Math.min(ceiling, state.level + modifiedDelta,),);

  const now = new Date().toISOString();
  await db
    .updateTable("character_arousal",)
    .set({
      level: newLevel,
      last_update: now,
      updated_at: now,
    },)
    .where("id", "=", state.id,)
    .execute();

  if (source) {
    const log = getLogger().child({ module: "seduction", },);
    log.info(`Arousal ${actorId}: ${state.level}→${newLevel} (${source})`,);
  }

  return newLevel;
}

/**
 * Decay arousal over time.
 * @param db
 * @param actorId
 * @param worldId
 */
export async function decayArousal(db: Kysely<DB>, actorId: string, worldId: string | null = null,): Promise<number> {
  const state = await getArousal(db, actorId, worldId,);
  if (state.level <= 0) { return 0; }

  const decay = state.level * state.decayRate * 0.1;
  const newLevel = Math.max(0, state.level - decay,);

  const now = new Date().toISOString();
  await db
    .updateTable("character_arousal",)
    .set({
      level: newLevel,
      last_update: now,
      updated_at: now,
    },)
    .where("id", "=", state.id,)
    .execute();

  return newLevel;
}

/**
 * Add a modifier to arousal state.
 * @param db
 * @param actorId
 * @param modifier
 * @param worldId
 */
export async function addModifier(
  db: Kysely<DB>,
  actorId: string,
  modifier: Omit<ArousalModifier, "remainingTurns"> & { duration: number },
  worldId: string | null = null,
): Promise<void> {
  const state = await getArousal(db, actorId, worldId,);

  const newMod: ArousalModifier = {
    ...modifier,
    remainingTurns: modifier.duration,
  };

  const mods = [...state.modifiers, newMod,];

  const now = new Date().toISOString();
  await db
    .updateTable("character_arousal",)
    .set({
      modifiers: jsonStringifyOr(mods,),
      updated_at: now,
    },)
    .where("id", "=", state.id,)
    .execute();
}
