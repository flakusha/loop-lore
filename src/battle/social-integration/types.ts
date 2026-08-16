// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { MoraleState, } from "../integration-schemas";

/** Social combat action type */
export type SocialCombatAction =
  | "intimidate"
  | "taunt"
  | "negotiate"
  | "surrender"
  | "rally"
  | "inspire"
  | "demoralize";

/** Social combat action result */
export interface SocialCombatResult {
  /** Action performed */
  action: SocialCombatAction;
  /** Whether action succeeded */
  success: boolean;
  /** Margin of success/failure */
  margin: number;
  /** Effect on target morale */
  moraleEffect: number;
  /** New morale state of target */
  targetMorale: MoraleState;
  /** Narrative description */
  narrative: string;
}
