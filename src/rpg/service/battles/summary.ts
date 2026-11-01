// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Deterministic end-of-battle summary (D4-A fast track). */
import type { BattleWithRoster, } from "./types.js";

export interface BattleSummary {
  battleId: string;
  over: boolean;
  winner: "player" | "enemy" | null;
  rounds: number;
  survivors: string[];
  fallen: string[];
  lines: string[];
}

export function buildBattleSummary(battle: BattleWithRoster, winner: "player" | "enemy" | null,): BattleSummary {
  const survivors: string[] = [];
  const fallen: string[] = [];
  for (const c of battle.combatants) {
    if (c.hp > 0) { survivors.push(c.name,); }
    else { fallen.push(c.name,); }
  }

  const side = winner === "enemy" ? "the enemies" : winner === "player" ? "the party" : null;
  const headline = battle.status === "completed" && side ? `**Combat over - ${side} win!**` : "**Battle ended.**";
  const lines = [
    headline,
    `Rounds: ${battle.round} - Combatants: ${battle.combatants.length} - Survivors: ${survivors.length}`,
    ...(fallen.length > 0 ? [`Fallen: ${fallen.join(", ",)}`,] : []),
  ];

  return {
    battleId: battle.id,
    over: battle.status !== "active",
    winner,
    rounds: battle.round,
    survivors,
    fallen,
    lines,
  };
}
