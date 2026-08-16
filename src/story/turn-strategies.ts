// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Turn Strategies — Story Module Re-export
 *
 * The generalized turn strategies live in src/turning/turn-strategies.ts.
 * This file re-exports them for backward compatibility with story/ imports.
 */
export {
  hybridSelect,
  initiativeSelect,
  questDrivenSelect,
  roundRobinSelect,
  sceneBasedSelect,
  STRATEGY_MAP,
} from "../turning/turn-strategies";

export type { TurnParticipant, } from "../turning/types";
