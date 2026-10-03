// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Turning Module — Barrel
 *
 * Generalized turn orchestration shared between story mode and group chats.
 * Story mode uses TurnManager directly; group chats use it via GroupTurnSelector.
 */

// ── Types ────────────────────────────────────────────────
export type { GroupTurnContext, TurnManagerState, TurnParticipant, TurnStrategyFn, } from "./types";

// ── Strategies ───────────────────────────────────────────
export {
  hybridSelect,
  initiativeSelect,
  questDrivenSelect,
  roundRobinSelect,
  sceneBasedSelect,
  STRATEGY_MAP,
} from "./turn-strategies";

// ── Classifier Selection ─────────────────────────────────
export type { ClassifierCandidate, TurnBeatType, TurnClassifierPick, } from "./classifier-selection";
export {
  parseTurnSelection,
  resolveTurnClassifierPick,
  TURN_BEAT_TYPES,
  TURN_SELECTION_PROMPT,
} from "./classifier-selection";

// ── Turn Manager ─────────────────────────────────────────
export { TurnManager, type TurnManagerOptions, } from "./turn-manager";
