// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { persistState, } from "./state";
import type { TurnManagerHost, } from "./types";

/**
 * Request regeneration of a failed turn
 * @param host
 * @param turnId
 * @param reason
 */
export async function requestRegeneration(
  host: TurnManagerHost,
  turnId: string,
  reason: string,
): Promise<boolean> {
  if (!host.state) { throw new Error("TurnManager not initialized",); }

  const currentAttempt = host.state.pendingRegeneration?.attempt ?? 0;
  if (currentAttempt >= host.maxRegenerations) { return false; }

  const nextAttempt = currentAttempt + 1;
  host.state.pendingRegeneration = { turnId, attempt: nextAttempt, reason, };
  await persistState(host, (state,) => {
    state.pendingRegeneration = { turnId, attempt: nextAttempt, reason, };
  },);
  return true;
}

/**
 * Clear pending regeneration (accepted)
 * @param host
 */
export async function clearRegeneration(host: TurnManagerHost,): Promise<void> {
  if (!host.state) { return; }
  host.state.pendingRegeneration = null;
  await persistState(host, (state,) => {
    state.pendingRegeneration = null;
  },);
}

/**
 * Pause turn generation
 * @param host
 */
export async function pause(host: TurnManagerHost,): Promise<void> {
  if (!host.state) { throw new Error("TurnManager not initialized",); }
  host.state.isPaused = true;
  await persistState(host, (state,) => {
    state.isPaused = true;
  },);
}

/**
 * Resume turn generation
 * @param host
 */
export async function resume(host: TurnManagerHost,): Promise<void> {
  if (!host.state) { throw new Error("TurnManager not initialized",); }
  host.state.isPaused = false;
  await persistState(host, (state,) => {
    state.isPaused = false;
  },);
}

/**
 * Reset turn counter (e.g., new scene)
 * @param host
 */
export async function resetTurnCounter(host: TurnManagerHost,): Promise<void> {
  if (!host.state) { throw new Error("TurnManager not initialized",); }
  host.state.currentTurn = 0;
  host.state.currentActorId = null;
  await persistState(host, (state,) => {
    state.currentTurn = 0;
    state.currentActorId = null;
  },);
}
