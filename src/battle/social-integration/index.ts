// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

export {
  processMoraleBreak,
} from "./morale";
export {
  calculateDemoralizeEffect,
  calculateIntimidationEffect,
  calculateTauntEffect,
} from "./offensive";
export {
  calculateInspireEffect,
  calculateRallyEffect,
} from "./support";
export {
  calculateSurrenderChance,
} from "./surrender";
export type {
  SocialCombatAction,
  SocialCombatResult,
} from "./types";
