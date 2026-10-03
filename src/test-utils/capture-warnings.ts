// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Capture `process.emitWarning` output for the duration of one body.
 *
 * Why a listener and not a stub: `process` is process-wide and `bun test`
 * runs every test file in a single process, so replacing
 * `process.emitWarning` with a no-op to read its arguments leaves a
 * process-global mutation behind if the test fails, times out, or the runner
 * is killed — silently swallowing warnings for every other file in the suite.
 * A `try/finally` cannot cover those cases.
 *
 * Subscribing to the `warning` event instead never mutates `process`: the
 * original `emitWarning` keeps running and keeps printing, so there is no
 * global state to restore. The listener is removed in `finally`, and a
 * listener orphaned by a killed test is inert — it appends to an unreachable
 * array and changes no other file's behaviour, which is the opposite of the
 * stub's failure mode.
 */

/**
 * Event-loop turns spent waiting for the warning queue to drain.
 *
 * Dispatch is asynchronous, so a capture must yield before its results are
 * complete. The bound is a ceiling that only a stalled queue ever reaches:
 * the `quiet` counter below ends the wait on the first turns that deliver
 * nothing, so the common case costs a couple of turns and a lost warning
 * fails the caller's assertion instead of hanging the suite.
 */
const FLUSH_TURNS = 20;

/** Consecutive idle turns that mean the queue has finished draining. */
const QUIET_TURNS = 2;

/**
 * Run `body` and return the warnings it emitted, optionally filtered.
 *
 * @param body work whose warnings are captured; awaited before draining
 * @param filter applied to each warning message; every warning passes when omitted
 * @returns warning messages emitted while `body` ran, in dispatch order
 */
export async function captureWarnings(
  body: () => Promise<void>,
  filter?: RegExp,
): Promise<string[]> {
  const messages: string[] = [];
  const onWarning = (warning: Error,): void => {
    if (filter === undefined || filter.test(warning.message,)) {
      messages.push(warning.message,);
    }
  };
  process.on("warning", onWarning,);
  try {
    await body();
    let previous = -1;
    let quiet = 0;
    for (let turn = 0; turn < FLUSH_TURNS && quiet < QUIET_TURNS; turn += 1) {
      await new Promise((resolve,) => setImmediate(resolve,));
      // Two consecutive idle turns, not one: a single idle turn is not proof
      // the queue is empty, and stopping on it would drop a warning whose
      // dispatch is merely late under load.
      quiet = messages.length === previous ? quiet + 1 : 0;
      previous = messages.length;
    }
  } finally {
    process.off("warning", onWarning,);
  }
  return messages;
}
