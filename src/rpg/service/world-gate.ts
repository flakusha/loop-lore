// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * World-Gate — RPG mechanics opt-in per world.
 *
 * Worlds set `rpg_enabled = 1` to activate RPG features.
 * Routes that modify RPG state should call `requireRpgEnabled` when a
 * world context is available.
 */

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";

/** */
export interface WorldGateResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Check if a world has RPG mechanics enabled.
 * @param database
 * @param worldId
 * @returns `{ allowed: true }` or `{ allowed: false, reason }`.
 */
export async function checkRpgEnabled(
  database: Kysely<DB>,
  worldId: string,
): Promise<WorldGateResult> {
  const world = await database
    .selectFrom("worlds",)
    .select("rpg_enabled",)
    .where("id", "=", worldId,)
    .executeTakeFirst();

  if (!world) {
    return { allowed: false, reason: "World not found", };
  }

  if (!world.rpg_enabled) {
    return { allowed: false, reason: "RPG mechanics are not enabled for this world", };
  }

  return { allowed: true, };
}
/**
 * Per-mechanic RPG opt-in flags for one world.
 *
 * Backed by the `rpg_*` integer columns on `worlds` (migration
 * `004_world_mechanics`, backfilled from `rpg_enabled` for parity).
 * Integer 0/1 maps to boolean here; the database stays the source of
 * truth for persistence.
 */
export interface MechanicsConfig {
  dice: boolean;
  checks: boolean;
  combat: boolean;
  xp: boolean;
  loot: boolean;
  quests: boolean;
}

/** Mechanics selectable via `checkMechanicEnabled` (fixed set). */
export const RpgMechanic = {
  Dice: "dice",
  Checks: "checks",
  Combat: "combat",
  Xp: "xp",
  Loot: "loot",
  Quests: "quests",
} as const;

/** One RPG mechanic by name (see `RpgMechanic`). */
export type RpgMechanic = (typeof RpgMechanic)[keyof typeof RpgMechanic];

/**
 * Read the per-mechanic RPG flags for a world.
 * @param database
 * @param worldId
 * @returns Mechanics flags, or `null` when the world does not exist.
 */
export async function getMechanicsConfig(
  database: Kysely<DB>,
  worldId: string,
): Promise<MechanicsConfig | null> {
  const world = await database
    .selectFrom("worlds",)
    .select(["rpg_dice", "rpg_checks", "rpg_combat", "rpg_xp", "rpg_loot", "rpg_quests",],)
    .where("id", "=", worldId,)
    .executeTakeFirst();
  if (!world) { return null; }
  return {
    dice: Boolean(world.rpg_dice,),
    checks: Boolean(world.rpg_checks,),
    combat: Boolean(world.rpg_combat,),
    xp: Boolean(world.rpg_xp,),
    loot: Boolean(world.rpg_loot,),
    quests: Boolean(world.rpg_quests,),
  };
}

/**
 * Check if one RPG mechanic is enabled for a world.
 * @param database
 * @param worldId
 * @param mechanic - Mechanic under test (see `RpgMechanic`).
 * @returns `{ allowed: true }` or `{ allowed: false, reason }`.
 */
export async function checkMechanicEnabled(
  database: Kysely<DB>,
  worldId: string,
  mechanic: RpgMechanic,
): Promise<WorldGateResult> {
  const config = await getMechanicsConfig(database, worldId,);
  if (!config) {
    return { allowed: false, reason: "World not found", };
  }
  if (!config[mechanic]) {
    return { allowed: false, reason: `RPG ${mechanic} mechanics are not enabled for this world`, };
  }
  return { allowed: true, };
}
/**
 * Gate a chat command on one RPG mechanic.
 *
 * Fail-open when there is no world context: commands invoked without a
 * database handle or outside a world chat keep their historical behavior
 * (parity with the pre-gate code, which knew no world). When a world is
 * known and the mechanic is off, returns the clean denial reply the
 * handler should send with `handled: true` — the mechanic never runs
 * and no game state is written.
 *
 * @example
 *   const denial = await checkCommandMechanic(ctx.db, ctx.activeChat?.worldId, RpgMechanic.Dice);
 *   if (denial) { return { systemMessage: denial, handled: true, }; }
 * @param database - Kysely handle, or undefined when the caller has none.
 * @param worldId - Resolved world id, or undefined outside a world chat.
 * @param mechanic - Mechanic under test (see `RpgMechanic`).
 * @returns Denial reply, or `null` when the command may run.
 */
export async function checkCommandMechanic(
  database: Kysely<DB> | undefined,
  worldId: string | undefined,
  mechanic: RpgMechanic,
): Promise<string | null> {
  if (!database || !worldId) { return null; }
  const gate = await checkMechanicEnabled(database, worldId, mechanic,);
  if (gate.allowed) { return null; }
  return `**RPG not enabled:** ${gate.reason ?? "this mechanic is disabled"}.`;
}
