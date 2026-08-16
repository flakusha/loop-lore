// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { persistState, } from "./state";
import type { TurnManagerHost, } from "./types";

/** Request regeneration of a failed turn */
export async function requestRegeneration(
  host: TurnManagerHost,
  turnId: string,
  reason: string,
): Promise<boolean> {
  if (!host.state) { throw new Error("TurnManager not initialized",); }

  const currentAttempt = host.state.pendingRegeneration?.attempt ?? 0;
  if (currentAttempt >= host.maxRegenerations) { return false; }

  host.state.pendingRegeneration = { turnId, attempt: currentAttempt + 1, reason, };
  await persistState(host,);
  return true;
}

/** Clear pending regeneration (accepted) */
export async function clearRegeneration(host: TurnManagerHost,): Promise<void> {
  if (!host.state) { return; }
  host.state.pendingRegeneration = null;
  await persistState(host,);
}

/** Pause turn generation */
export async function pause(host: TurnManagerHost,): Promise<void> {
  if (!host.state) { throw new Error("TurnManager not initialized",); }
  host.state.isPaused = true;
  await persistState(host,);
}

/** Resume turn generation */
export async function resume(host: TurnManagerHost,): Promise<void> {
  if (!host.state) { throw new Error("TurnManager not initialized",); }
  host.state.isPaused = false;
  await persistState(host,);
}

/** Reset turn counter (e.g., new scene) */
export async function resetTurnCounter(host: TurnManagerHost,): Promise<void> {
  if (!host.state) { throw new Error("TurnManager not initialized",); }
  host.state.currentTurn = 0;
  host.state.currentActorId = null;
  await persistState(host,);
}
