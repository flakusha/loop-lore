// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * RPG opt-in flag helpers for the world create/update handlers.
 *
 * Worlds carry one master switch (`rpg_enabled`) plus one flag per mechanic
 * (`rpg_dice`, `rpg_checks`, `rpg_combat`, `rpg_xp`, `rpg_loot`, `rpg_quests`).
 * The chat-command gates in `src/rpg/service/world-gate.ts` enforce the
 * per-mechanic flags; these helpers keep the stored columns consistent with
 * what the API caller asked for.
 */

/**
 * Normalize an RPG opt-in flag (boolean or 0/1) to its stored 0/1 form.
 * @param value - Raw request-body value.
 * @returns 0, 1, or null when absent/invalid (caller applies the default).
 * @example
 * toRpgFlag(true) → 1
 */
export function toRpgFlag(value: unknown,): 0 | 1 | null {
  if (value === true || value === 1) { return 1; }
  if (value === false || value === 0) { return 0; }
  return null;
}

/** Stored RPG columns for a `worlds` insert. */
export interface RpgCreateFlags {
  rpg_enabled: 0 | 1;
  rpg_dice: 0 | 1;
  rpg_checks: 0 | 1;
  rpg_combat: 0 | 1;
  rpg_xp: 0 | 1;
  rpg_loot: 0 | 1;
  rpg_quests: 0 | 1;
}

/**
 * Build the stored RPG columns for a new world.
 *
 * Creation parity: per-mechanic flags default to the world's own opt-in
 * value, so an RPG world starts fully armed and a plain world stays off.
 * @param body - Raw request-body values (camelCase flag names).
 * @returns Snake_case columns ready to spread into the insert.
 * @example
 * rpgCreateFlags({ rpgEnabled: true, rpgCombat: false })
 * // → { rpg_enabled: 1, rpg_dice: 1, …, rpg_combat: 0, … }
 */
export function rpgCreateFlags(body: Record<string, unknown>,): RpgCreateFlags {
  const rpgEnabled = toRpgFlag(body.rpgEnabled,) ?? 0;
  return {
    rpg_enabled: rpgEnabled,
    rpg_dice: toRpgFlag(body.rpgDice,) ?? rpgEnabled,
    rpg_checks: toRpgFlag(body.rpgChecks,) ?? rpgEnabled,
    rpg_combat: toRpgFlag(body.rpgCombat,) ?? rpgEnabled,
    rpg_xp: toRpgFlag(body.rpgXp,) ?? rpgEnabled,
    rpg_loot: toRpgFlag(body.rpgLoot,) ?? rpgEnabled,
    rpg_quests: toRpgFlag(body.rpgQuests,) ?? rpgEnabled,
  };
}

/**
 * Fold RPG opt-in flags from an update body into the update map.
 *
 * The master switch arms every mechanic; per-mechanic flags applied after it
 * refine the result, so one request can enable RPG and opt a mechanic back out.
 * @param body - Raw request-body values (camelCase flag names).
 * @param updates - Update map receiving snake_case columns.
 */
export function applyRpgUpdates(body: Record<string, unknown>, updates: Record<string, unknown>,): void {
  const rpgEnabled = toRpgFlag(body.rpgEnabled,);
  if (rpgEnabled != null) {
    updates.rpg_enabled = rpgEnabled;
    updates.rpg_dice = rpgEnabled;
    updates.rpg_checks = rpgEnabled;
    updates.rpg_combat = rpgEnabled;
    updates.rpg_xp = rpgEnabled;
    updates.rpg_loot = rpgEnabled;
    updates.rpg_quests = rpgEnabled;
  }
  const dice = toRpgFlag(body.rpgDice,);
  if (dice != null) { updates.rpg_dice = dice; }
  const checks = toRpgFlag(body.rpgChecks,);
  if (checks != null) { updates.rpg_checks = checks; }
  const combat = toRpgFlag(body.rpgCombat,);
  if (combat != null) { updates.rpg_combat = combat; }
  const xp = toRpgFlag(body.rpgXp,);
  if (xp != null) { updates.rpg_xp = xp; }
  const loot = toRpgFlag(body.rpgLoot,);
  if (loot != null) { updates.rpg_loot = loot; }
  const quests = toRpgFlag(body.rpgQuests,);
  if (quests != null) { updates.rpg_quests = quests; }
}
