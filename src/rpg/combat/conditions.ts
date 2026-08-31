// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { type Combatant, } from "./types.js";

// ── Condition Checks ────────────────────────────────────

/**
 * Check if a combatant is incapacitated (can't take actions).
 * @param combatant
 */
export function isIncapacitated(combatant: Combatant,): boolean {
  return combatant.conditions.some((c,) => ["stunned", "paralyzed", "unconscious", "petrified",].includes(c,));
}

/**
 * Check if a combatant is dead (0 HP).
 * @param combatant
 */
export function isDead(combatant: Combatant,): boolean {
  return combatant.hp <= 0;
}

/**
 * Check if combat is over (all of one side is defeated).
 * @param combatants
 */
export function isCombatOver(combatants: Combatant[],): {
  over: boolean;
  winner: "player" | "enemy" | null;
} {
  const alive: Combatant[] = [];
  for (const c of combatants) { if (c.hp > 0) { alive.push(c,); } }
  const players: Combatant[] = [];
  for (const c of alive) { if (!c.isNpc) { players.push(c,); } }
  const enemies: Combatant[] = [];
  for (const c of alive) { if (c.isNpc) { enemies.push(c,); } }

  if (players.length === 0) {
    return { over: true, winner: "enemy", };
  }
  if (enemies.length === 0) {
    return { over: true, winner: "player", };
  }
  return { over: false, winner: null, };
}
