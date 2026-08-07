/**
 * NPC Integration for Battle
 *
 * Personality-driven AI, memory of past battles, and relationship effects.
 */

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
    default: {
      return "Unknown decision";
    }
  }
}

/** Check if NPC would remember a battle */
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

/** Create battle memory from encounter */
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

/** Get NPC morale modifier from personality */
export function getPersonalityMoraleModifier(
  personality: NPCPersonality,
): number {
  let modifier = 0;

  // High courage = higher base morale
  modifier += (personality.courage - 50) / 5;

  // High loyalty = morale boost when fighting with allies
  modifier += (personality.loyalty - 50) / 10;

  // High caution = lower morale when outnumbered
  modifier -= (personality.caution - 50) / 10;

  return Math.max(-20, Math.min(20, Math.round(modifier,),),);
}

/** Check if NPC would surrender */
export function wouldNPCSurrender(
  personality: NPCPersonality,
  currentHealth: number,
  maxHealth: number,
  battleMemories: NPCBattleMemory[],
): { surrender: boolean; confidence: number } {
  const healthPercent = (currentHealth / maxHealth) * 100;

  // High courage NPCs rarely surrender
  if (personality.courage > 80) {
    return { surrender: false, confidence: 90, };
  }

  // Low health increases surrender chance
  let surrenderChance = 0;
  if (healthPercent < 20) { surrenderChance += 40; }
  else if (healthPercent < 40) { surrenderChance += 20; }
  else if (healthPercent < 60) { surrenderChance += 10; }

  // Low courage increases surrender chance
  surrenderChance += (50 - personality.courage) / 2;

  // Recent defeats increase surrender chance
  let defeatCount = 0;
  for (const m of battleMemories) { if (m.outcome === "defeat") { defeatCount++; } }
  surrenderChance += defeatCount * 5;

  // Cap at 95%
  surrenderChance = Math.min(95, Math.max(0, surrenderChance,),);

  return {
    surrender: Math.random() * 100 < surrenderChance,
    confidence: Math.round(surrenderChance,),
  };
}
