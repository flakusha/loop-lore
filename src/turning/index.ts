/**
 * Turning Module — Barrel
 *
 * Generalized turn orchestration shared between story mode and group chats.
 * Story mode uses TurnManager directly; group chats use it via GroupTurnSelector.
 */

// ── Types ────────────────────────────────────────────────
export type { TurnParticipant, TurnManagerState, GroupTurnContext, TurnStrategyFn } from "./types";

// ── Strategies ───────────────────────────────────────────
export {
  roundRobinSelect,
  sceneBasedSelect,
  initiativeSelect,
  questDrivenSelect,
  hybridSelect,
  STRATEGY_MAP,
} from "./turn-strategies";

// ── Turn Manager ─────────────────────────────────────────
export { TurnManager, type TurnManagerOptions } from "./turn-manager";
