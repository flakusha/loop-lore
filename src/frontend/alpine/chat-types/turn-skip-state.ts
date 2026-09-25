// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Turn-skip mode, mirroring the `TurnSkipBody` route schema. */
export type TurnSkipMode = "hold" | "advance";

/** Turn-skip slice of chat state (merge into ChatState on registration). */
export interface TurnSkipState {
  /** Inline hold/advance choice visibility. */
  _turnSkipOpen: boolean;
  /** True while a skip POST is in flight. */
  _skipping: boolean;
  toggleTurnSkip(): void;
  closeTurnSkip(): void;
  /** Open the skip choice when a hard send gate blocks the composer. */
  suggestTurnSkip(): void;
  skipTurn(mode: TurnSkipMode,): Promise<void>;
}
