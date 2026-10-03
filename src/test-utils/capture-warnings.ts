// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { AsyncLocalStorage, } from "node:async_hooks";

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
 *
 * A listener alone is not enough, though. The `warning` event is
 * process-wide, so a listener receives EVERY warning the process emits while
 * its window is open — including warnings belonging to a different test file
 * running in the same `bun test` process. Collected unfiltered, a caller
 * asserting an exact count fails on another file's warning, and only under
 * parallel load. A `filter` is the wrong tool for that: it is optional, so
 * being safe would depend on every call site remembering a convention.
 *
 * So the window is scoped by async context instead. `emitWarning` captures the
 * async context of its call site and the `warning` event dispatches in that
 * same context, so the token stored here for the duration of the body is
 * exactly what a listener can test to answer "did *this* body warn?" — a
 * warning from another file carries that file's context (or none) and is
 * dropped. This holds whether or not a `filter` is supplied.
 */

/**
 * The active capture's token, visible to the `warning` listener.
 *
 * A `Symbol` per call, so a nested capture's warnings stay out of the
 * enclosing capture's result and two sibling captures never share a token.
 */
const scope = new AsyncLocalStorage<symbol>();

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
 * Run `body` and return the warnings IT emitted, optionally filtered.
 *
 * Warnings from outside the capture's async scope are excluded even with no
 * `filter`, so an exact-count assertion here is safe against a concurrent
 * test file. A `filter` narrows further, to a message shape.
 *
 * @param body work whose warnings are captured; awaited before draining
 * @param filter applied to each in-scope warning message; every one passes when omitted
 * @returns warning messages emitted by `body`, in dispatch order
 */
export async function captureWarnings(
  body: () => Promise<void>,
  filter?: RegExp,
): Promise<string[]> {
  const messages: string[] = [];
  const token = Symbol("captureWarnings",);
  const onWarning = (warning: Error,): void => {
    // The scope test is what makes the count safe; the filter is only a
    // narrowing on top. A warning emitted outside this call's async context
    // belongs to some other file and is not this caller's to assert on.
    if (scope.getStore() !== token) { return; }
    if (filter === undefined || filter.test(warning.message,)) {
      messages.push(warning.message,);
    }
  };
  process.on("warning", onWarning,);
  try {
    // The body runs INSIDE the scope, and the drain below too, so a warning
    // emitted by work the body started but did not await is still in scope.
    await scope.run(token, async () => {
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
    },);
  } finally {
    // Detached on every exit: success, body throw, and drain throw alike. A
    // killed runner skips this, which is why the orphaned listener is inert.
    process.off("warning", onWarning,);
  }
  return messages;
}
