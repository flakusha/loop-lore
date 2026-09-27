// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Game state service layer — public API.
 * @module game-state
 */

export {
  analyzeGameState,
  type GameState,
  type GameStateAnalysis,
} from "./analyze";
export {
  type ChatQueryArgs,
  extractAndStore,
  type ExtractAndStoreArgs,
  type GameStateHistoryRow,
  getGameStateHistory,
  getLatestGameState,
  type LatestGameState,
} from "./service";
