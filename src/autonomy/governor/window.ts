// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/autonomy/governor/window.ts — rolling-window arithmetic
//
// Shared by `tryConsume` (which then mutates) and `peek` (which must
// not). A stale or absent row means a fresh window, so both paths agree
// on when a counter resets instead of each re-deriving it.

import { toDate, } from "../../utils/date";
import type { BudgetRow, GovernorLimit, } from "./types";

/** A window's effective position at an instant. */
export interface WindowState {
  /** Epoch ms the current window opened — not `nowMs` unless it just reset. */
  startMs: number;
  /** Consumes already recorded in this window. */
  count: number;
  /** Epoch ms the window rolls over. */
  resetAtMs: number;
}

/**
 * Fold a persisted row into the window in force at `nowMs`.
 *
 * A missing row, or one whose window has already rolled past, reads as
 * a fresh window opening at `nowMs` with count 0.
 *
 * @param row persisted budget row, or null when none exists
 * @param limit the limit definition (supplies the window length)
 * @param nowMs current instant
 * @returns the effective window
 */
export function effectiveWindow(
  row: BudgetRow | null,
  limit: GovernorLimit,
  nowMs: number,
): WindowState {
  if (row === null) { return { startMs: nowMs, count: 0, resetAtMs: nowMs + limit.windowMs, }; }

  const startMs = toDate(row.window_start_at,).getTime();
  // A rolled-past row must read as a fresh window, not a stale count.
  if (nowMs >= startMs + limit.windowMs) {
    return { startMs: nowMs, count: 0, resetAtMs: nowMs + limit.windowMs, };
  }
  return { startMs, count: row.window_count, resetAtMs: startMs + limit.windowMs, };
}
