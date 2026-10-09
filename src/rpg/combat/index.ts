// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

export { ActionType, } from "./types.js";

export type {
  AttackResult,
  CombatAction,
  Combatant,
  DamageResistance,
  DamageResult,
  DamageType,
  InitiativeResult,
  RoundResult,
} from "./types.js";

export {
  rollInitiative,
  sortByInitiative,
} from "./initiative.js";

export { makeAttackRoll, } from "./attacks.js";
export { makeSavingThrow, } from "./saves.js";

export {
  canTakeAction,
  consumeAction,
  initCombatant,
  resetRoundReactions,
  resetTurnActions,
} from "./actions.js";

export {
  applyDamage,
  healCombatant,
} from "./damage.js";

export {
  isCombatOver,
  isDead,
  isIncapacitated,
} from "./conditions.js";
