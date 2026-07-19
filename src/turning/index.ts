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

// ── Turn Manager ─────────────────────────────────────────
export { TurnManager, type TurnManagerOptions, } from "./turn-manager";
