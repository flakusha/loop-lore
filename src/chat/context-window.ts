// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Context Window Manager
 *
 * Tracks token usage against configured thresholds and determines when
 * trimming is needed. The former sliding-window computation and inject
 * helpers (PATH B) were removed — the real pipeline is the prompt
 * assembler (`src/assistant/prompt-assembler.ts`) with `ContextCompactor`.
 *
 * This module is stateless — no database operations.
 */
import type {
  ContextThreshold,
  ContextThresholds,
} from "./types";

// ─── Default Configuration ────────────────────────────────────

const DEFAULT_THRESHOLDS: ContextThresholds = {
  warning: 60,
  critical: 80,
  imminent: 95,
};

// ─── Threshold State ───────────────────────────────────────────

/**
 * Get the current context threshold state.
 * @param usagePercentage - Current usage as percentage (0-100)
 * @param thresholds - Threshold configuration
 * @returns Current threshold state
 */
export function getThresholdState(
  usagePercentage: number,
  thresholds: ContextThresholds = DEFAULT_THRESHOLDS,
): ContextThreshold {
  if (usagePercentage >= thresholds.imminent) { return "imminent"; }
  if (usagePercentage >= thresholds.critical) { return "critical"; }
  if (usagePercentage >= thresholds.warning) { return "warning"; }
  return "healthy";
}
