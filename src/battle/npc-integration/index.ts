// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

export {
  makeNPCDecision,
} from "./decision";
export {
  createBattleMemory,
  shouldRememberBattle,
} from "./memory";
export {
  getPersonalityMoraleModifier,
  wouldNPCSurrender,
} from "./personality";
export type {
  BattleOutcome,
  NPCBattleMemory,
  NPCCombatDecision,
  NPCPersonality,
} from "./types";
