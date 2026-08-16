// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** NPC personality traits affecting combat */
export interface NPCPersonality {
  /** Aggression level (0-100) */
  aggression: number;
  /** Caution level (0-100) */
  caution: number;
  /** Loyalty level (0-100) */
  loyalty: number;
  /** Intelligence level (0-100) */
  intelligence: number;
  /** Courage level (0-100) */
  courage: number;
}

/** Battle outcome */
export type BattleOutcome = "victory" | "defeat" | "draw";

/** NPC battle memory entry */
export interface NPCBattleMemory {
  /** Battle ID */
  battleId: string;
  /** When this battle occurred */
  timestamp: string;
  /** Outcome (victory, defeat, draw) */
  outcome: BattleOutcome;
  /** Opponent IDs */
  opponents: string[];
  /** What the NPC learned */
  lessons: string[];
  /** Emotional impact (-100 to +100) */
  emotionalImpact: number;
}

/** NPC combat decision */
export interface NPCCombatDecision {
  /** Decision type */
  type: "attack" | "defend" | "flee" | "negotiate" | "use_item" | "special";
  /** Target (if applicable) */
  targetId?: string;
  /** Confidence in this decision (0-100) */
  confidence: number;
  /** Reasoning */
  reasoning: string;
}
