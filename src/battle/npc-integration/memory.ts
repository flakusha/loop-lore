// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type {
  NPCBattleMemory,
  NPCPersonality,
} from "./types";

/**
 * Check if NPC would remember a battle
 * @param personality
 * @param battleOutcome
 * @param opponentLevel
 */
export function shouldRememberBattle(
  personality: NPCPersonality,
  battleOutcome: "victory" | "defeat" | "draw",
  opponentLevel: number,
): boolean {
  // High intelligence NPCs remember more
  const memoryChance = personality.intelligence / 100;

  // Defeats are remembered more often
  let outcomeMultiplier = 1;
  if (battleOutcome === "defeat") { outcomeMultiplier = 1.5; }
  else if (battleOutcome === "draw") { outcomeMultiplier = 0.5; }

  // Fighting stronger opponents is more memorable
  const levelDifference = Math.max(0, opponentLevel - 10,) / 10;

  const totalChance = memoryChance * outcomeMultiplier * (1 + levelDifference);
  return Math.random() < Math.min(1, totalChance,);
}

/**
 * Create battle memory from encounter
 * @param battleId
 * @param outcome
 * @param opponents
 * @param opponentLevel
 * @param npcLevel
 */
export function createBattleMemory(
  battleId: string,
  outcome: "victory" | "defeat" | "draw",
  opponents: string[],
  opponentLevel: number,
  npcLevel: number,
): NPCBattleMemory {
  // Emotional impact based on outcome and level difference
  let emotionalImpact = 0;
  const levelDiff = npcLevel - opponentLevel;

  switch (outcome) {
    case "victory": {
      emotionalImpact = 20 + levelDiff * 2;
      break;
    }
    case "defeat": {
      emotionalImpact = -30 - Math.abs(levelDiff,) * 3;
      break;
    }
    case "draw": {
      emotionalImpact = 5 + levelDiff;
      break;
    }
  }

  // Clamp
  emotionalImpact = Math.max(-100, Math.min(100, emotionalImpact,),);

  // Generate lessons
  const lessons: string[] = [];
  if (outcome === "defeat") {
    lessons.push("Learned from defeat",);
    if (levelDiff < -5) { lessons.push("Opponent was much stronger",); }
    if (opponents.length > 1) { lessons.push("Faced multiple opponents",); }
  } else if (outcome === "victory") {
    lessons.push("Won the battle",);
    if (levelDiff > 5) { lessons.push("Opponent was weaker than expected",); }
  }

  return {
    battleId,
    timestamp: new Date().toISOString(),
    outcome,
    opponents,
    lessons,
    emotionalImpact,
  };
}
