// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Pending VN decision flag.
 *
 * The single shared bit that both card modules write and the composer reads,
 * so the composer can warn BEFORE the optimistic push instead of rolling back
 * a message the server just 409'd (see `enforceVnDecisionGate` — the
 * authoritative server-side gate; this flag is advisory only).
 *
 * Module-level singleton with a lockstep read/write pair, matching the existing
 * `choice-cards` / `question-cards` module state. Not Alpine state: nothing in
 * the store needs to react to it, and routing it through `ChatState` would mean
 * a store field, a setter and a bridge for one boolean.
 */

/** True while a branching choice or Q&A question is still resolvable. */
let pending = false;

/** Read by `chat-send.ts` before the optimistic push. */
export function isVnDecisionPending(): boolean {
  return pending;
}

/**
 * Called by both card modules on load, resolve, and destroy — the three points
 * where pending-ness can actually change. Direct `pending = …` assignment
 * would need a lockstep reader at each of those sites anyway.
 * @param value
 */
export function setVnDecisionPending(value: boolean,): void {
  pending = value;
}
