// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type {
  NPCBattleMemory,
  NPCCombatDecision,
  NPCPersonality,
} from "./types";

/** Make NPC combat decision based on personality */
export function makeNPCDecision(
  personality: NPCPersonality,
  currentHealth: number,
  maxHealth: number,
  enemyCount: number,
  allyCount: number,
  battleMemories: NPCBattleMemory[],
): NPCCombatDecision {
  const healthPercent = (currentHealth / maxHealth) * 100;
  const isOutnumbered = enemyCount > allyCount;

  // Calculate decision weights based on personality
  let attackWeight = personality.aggression * (1 + personality.courage / 100);
  let defendWeight = personality.caution * (1 + (100 - healthPercent) / 100);
  let fleeWeight = (100 - personality.courage) * (isOutnumbered ? 2 : 1);
  const negotiateWeight = personality.intelligence * (personality.loyalty / 100);

  // Check battle memories for patterns
  const defeats: NPCBattleMemory[] = [];
  for (const m of battleMemories) { if (m.outcome === "defeat") { defeats.push(m,); } }
  const recentDefeats = defeats.slice(-3,); // Last 3 defeats

  let memoryModifier = 0;
  for (const defeat of recentDefeats) {
    memoryModifier += defeat.emotionalImpact / 10;
  }

  // Adjust weights based on health
  if (healthPercent < 25) {
    fleeWeight *= 2;
    defendWeight *= 1.5;
    attackWeight *= 0.5;
  } else if (healthPercent < 50) {
    defendWeight *= 1.2;
  }

  // Find the highest weight
  const decisions: { type: NPCCombatDecision["type"]; weight: number }[] = [
    { type: "attack", weight: attackWeight + memoryModifier, },
    { type: "defend", weight: defendWeight, },
    { type: "flee", weight: fleeWeight, },
    { type: "negotiate", weight: negotiateWeight, },
  ];

  // Sort by weight
  decisions.sort((a, b,) => b.weight - a.weight);

  const bestDecision = decisions[0];
  if (!bestDecision) {
    return {
      type: "attack",
      confidence: 50,
      reasoning: "Defaulting to attack",
    };
  }

  let totalWeight = 0;
  for (const d of decisions) { totalWeight += Math.max(0, d.weight,); }
  const confidence = totalWeight > 0
    ? Math.round((Math.max(0, bestDecision.weight,) / totalWeight) * 100,)
    : 50;

  return {
    type: bestDecision.type,
    confidence: Math.min(100, Math.max(0, confidence,),),
    reasoning: generateDecisionReasoning(bestDecision.type, personality, healthPercent, isOutnumbered,),
  };
}

/** Generate reasoning text for decision */
function generateDecisionReasoning(
  type: NPCCombatDecision["type"],
  personality: NPCPersonality,
  healthPercent: number,
  isOutnumbered: boolean,
): string {
  switch (type) {
    case "attack": {
      if (personality.aggression > 70) { return "Aggressive personality drives attack"; }
      if (personality.courage > 80) { return "High courage emboldens attack"; }
      return "Sees opportunity to strike";
    }
    case "defend": {
      if (personality.caution > 70) { return "Cautious nature favors defense"; }
      if (healthPercent < 50) { return "Wounded, needs to protect self"; }
      return "Defensive posture chosen";
    }
    case "flee": {
      if (personality.courage < 30) { return "Low courage prompts retreat"; }
      if (isOutnumbered) { return "Outnumbered, tactical retreat"; }
      return "Assesses situation as unfavorable";
    }
    case "negotiate": {
      if (personality.intelligence > 70) { return "Intelligent approach to avoid conflict"; }
      if (personality.loyalty > 60) { return "Values relationships over violence"; }
      return "Seeks diplomatic solution";
    }
    case "special": {
      return "Deploys a special ability";
    }
    case "use_item": {
      return "Uses an item from inventory";
    }
    default: {
      return "Unknown decision";
    }
  }
}
