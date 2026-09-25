// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Coordination Priority — defer-one-tick rule for the autonomy scheduler.
 *
 * If a player message is in flight on the same scene, the scheduler
 * defers any autonomous NPC action that would foreclose a player choice;
 * the action is queued and dispatched on the next tick.
 *
 * penny-pinching on infra: an in-process `Map` per server instance
 * tracks pending player intents (SceneId → set of pending tokens).
 *
 * ponytail: coordination-priority uses in-process map; replace with
 * actor-scoped lock when multi-instance deployment arrives.
 *
 * @module services/agency/coordination-priority
 */

interface PendingIntent {
  actorId: string;
  /** Set when the intent enters; cleared when the response stream ends. */
  inFlight: boolean;
}

const sceneIntents = new Map<string, Map<string, PendingIntent>>();

export interface QueueResult {
  status: "dispatched" | "queued";
  reason?: string;
}

const queuedActions: Array<{ sceneId: string; action: { actorId: string; payload: unknown; }; enqueuedAt: number; }> = [];

/**
 * Mark a player intent as pending for `sceneId`. Call when a user message
 * begins processing (i.e., before LLM invocation). Idempotent — repeat
 * calls for the same `(sceneId, actorId)` are no-ops.
 * @param sceneId
 * @param actorId
 */
export function markPlayerIntentPending(sceneId: string, actorId: string,): void {
  let bucket = sceneIntents.get(sceneId,);
  if (!bucket) { bucket = new Map(); sceneIntents.set(sceneId, bucket,); }
  if (!bucket.has(actorId,)) { bucket.set(actorId, { actorId, inFlight: true, },); }
}

/**
 * Mark a previously-pending intent as resolved (the response stream ended).
 * @param sceneId
 * @param actorId
 */
export function markPlayerIntentResolved(sceneId: string, actorId: string,): void {
  const bucket = sceneIntents.get(sceneId,);
  if (!bucket) { return; }
  bucket.delete(actorId,);
  if (bucket.size === 0) { sceneIntents.delete(sceneId,); }
}

/**
 * Check whether any player intent is currently in flight on `sceneId`.
 * @param sceneId
 */
export function hasPlayerIntent(sceneId: string,): boolean {
  const bucket = sceneIntents.get(sceneId,);
  if (!bucket) { return false; }
  for (const v of bucket.values()) { if (v.inFlight) { return true; } }
  return false;
}

/**
 * Coordination gate: if a player intent is pending on the scene, queue
 * the action for the next tick (FIFO per scene). Otherwise dispatch now.
 *
 * @param sceneId
 * @param action
 */
export function enqueueIfNoPlayerIntent(
  sceneId: string,
  action: { actorId: string; payload: unknown; },
): QueueResult {
  if (hasPlayerIntent(sceneId,)) {
    queuedActions.push({ sceneId, action, enqueuedAt: Date.now(), },);
    return { status: "queued", reason: "player_intent_in_flight", };
  }
  return { status: "dispatched", };
}

/**
 * Drain queued actions for a scene. Called by the autonomy scheduler on
 * the next tick after a player intent clears.
 * @param sceneId
 */
export function drainQueuedActions(sceneId: string,): Array<{ actorId: string; payload: unknown; }> {
  const out: Array<{ actorId: string; payload: unknown; }> = [];
  for (let i = 0; i < queuedActions.length; i++) {
    if (queuedActions[i]!.sceneId === sceneId) {
      out.push(queuedActions[i]!.action,);
      queuedActions.splice(i, 1,);
      i--;
    }
  }
  return out;
}

/**
 * Test-only: clear all in-process state. Not part of the public API.
 */
export function __resetCoordinationState(): void {
  sceneIntents.clear();
  queuedActions.length = 0;
}

/**
 * Test-only: peek the queue length. Not part of the public API.
 */
export function __queueLength(): number {
  return queuedActions.length;
}
