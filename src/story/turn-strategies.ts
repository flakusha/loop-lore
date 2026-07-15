/**
 * Turn Strategies — Story Module Re-export
 *
 * The generalized turn strategies live in src/turning/turn-strategies.ts.
 * This file re-exports them for backward compatibility with story/ imports.
 */
export {
  roundRobinSelect,
  sceneBasedSelect,
  initiativeSelect,
  questDrivenSelect,
  hybridSelect,
  STRATEGY_MAP,
} from "../turning/turn-strategies";

export type { TurnParticipant } from "../turning/types";
