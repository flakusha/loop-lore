import { abilityModifier, type StatBlock, } from "../stats.js";
import { type ActionType, type Combatant, } from "./types.js";

// ── Action Economy ──────────────────────────────────────

/** Actions allowed per turn at level 1 */
const BASE_ACTIONS = 1;
const BASE_BONUS_ACTIONS = 1;
const BASE_REACTIONS = 1;

/**
 * Initialize a combatant for combat.
 */
export function initCombatant(
  id: string,
  name: string,
  stats: StatBlock,
  level: number,
  hp: number,
  ac: number,
  isNpc: boolean,
): Combatant {
  return {
    id,
    name,
    hp,
    maxHp: hp,
    ac,
    stats,
    level,
    isNpc,
    initiative: 0,
    initiativeMod: abilityModifier(stats.dex,),
    hasActed: false,
    actions: BASE_ACTIONS,
    bonusActions: BASE_BONUS_ACTIONS,
    reactions: BASE_REACTIONS,
    conditions: [],
  };
}

/**
 * Check if a combatant can take a specific action type.
 */
export function canTakeAction(combatant: Combatant, type: ActionType,): boolean {
  if (combatant.conditions.includes("stunned",) || combatant.conditions.includes("paralyzed",)) {
    return false;
  }

  switch (type) {
    case "reaction": {
      return combatant.reactions > 0;
    }
    case "bonus_action": {
      return combatant.bonusActions > 0;
    }
    case "free_action": {
      return true;
    }
    default: {
      return combatant.actions > 0;
    }
  }
}

/**
 * Consume an action from a combatant.
 */
export function consumeAction(combatant: Combatant, type: ActionType,): Combatant {
  const updated = { ...combatant, };

  switch (type) {
    case "reaction": {
      updated.reactions = Math.max(0, updated.reactions - 1,);
      break;
    }
    case "bonus_action": {
      updated.bonusActions = Math.max(0, updated.bonusActions - 1,);
      break;
    }
    case "free_action": {
      break;
    }
    default: {
      updated.actions = Math.max(0, updated.actions - 1,);
      updated.hasActed = true;
      break;
    }
  }

  return updated;
}

/**
 * Reset combatant's actions for a new turn.
 */
export function resetTurnActions(combatant: Combatant,): Combatant {
  return {
    ...combatant,
    actions: BASE_ACTIONS,
    bonusActions: BASE_BONUS_ACTIONS,
    hasActed: false,
  };
}

/**
 * Reset reactions for a new round (start of turn cycle).
 */
export function resetRoundReactions(combatants: Combatant[],): Combatant[] {
  return Array.from(combatants, (c,) => ({ ...c, reactions: BASE_REACTIONS, }),);
}
