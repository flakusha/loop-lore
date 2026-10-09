// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Pending VN decision flags.
 *
 * The shared bits both card modules write and the composer reads, so the
 * composer can warn BEFORE the optimistic push instead of rolling back a
 * message the server just 409'd (see `enforceVnDecisionGate` — the
 * authoritative server-side gate; these flags are advisory only).
 *
 * Tracked PER SOURCE, not as one boolean. `render-scene.ts` fires
 * `loadChoices()` and `loadQuestions()` fire-and-forget, so a single shared bit
 * is last-writer-wins: a chat with a pending question and no choices ends with
 * the flag false, because the (empty) choice list resolved last. Each source
 * owns its own slot and `isVnDecisionPending()` ORs them, so neither module can
 * clobber the other's answer.
 *
 * Module-level singletons with lockstep read/write pairs, matching the existing
 * `choice-cards` / `question-cards` module state. Not Alpine state: nothing in
 * the store needs to react to it, and routing it through `ChatState` would mean
 * a store field, a setter and a bridge for two booleans.
 */

/** Independently-tracked pending state, one slot per card module. */
const pending = { choice: false, question: false, };

/** Read by `chat-send.ts` before the optimistic push. */
export function isVnDecisionPending(): boolean {
  return pending.choice || pending.question;
}

/**
 * Record whether a branching choice is pending. Called by `choice-cards` on
 * load, resolve, skip and destroy — the four points where its pending-ness can
 * actually change.
 * @param value
 */
export function setChoicePending(value: boolean,): void {
  pending.choice = value;
}

/**
 * Record whether a Q&A question is pending. Called by `question-cards` on the
 * same four transitions.
 * @param value
 */
export function setQuestionPending(value: boolean,): void {
  pending.question = value;
}
