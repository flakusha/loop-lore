// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Bounds tests for the per-local-box serial video dispatch gate: queue-wait
 * ceiling (429 without running, default value) and FIFO dispatch on release.
 *
 * Synchronization is deterministic: every wait is on a real signal (a
 * deferred) — never a guessed wall-clock duration.
 */
import { beforeEach, describe, expect, test, } from "bun:test";
import {
  __resetVideoPreDispatchHookForTests,
  dispatchThroughVideoGate,
  VIDEO_QUEUE_WAIT_MS,
} from "./video-dispatch-gate";

beforeEach(() => {
  __resetVideoPreDispatchHookForTests();
},);

/** Deferred gate for overlap assertions. */
function deferred(): { promise: Promise<void>; release: () => void } {
  const { promise, resolve, } = Promise.withResolvers<void>();
  return { promise, release: resolve, };
}

describe("video dispatch gate — bounds", () => {
  test("queued job dispatches when the slot releases (FIFO)", async () => {
    const order: string[] = [];
    const first = deferred();
    const one = dispatchThroughVideoGate({
      providers: [{ localBox: "box-a", },],
      run: async () => {
        await first.promise;
        order.push("one",);
      },
    },);

    const twoRan = dispatchThroughVideoGate({
      providers: [{ localBox: "box-a", },],
      run: async () => {
        order.push("two",);
      },
    },);

    first.release();
    await one;
    await twoRan;
    expect(order,).toEqual(["one", "two",],);
  });

  test("waiter past the queue-wait ceiling fails 429 without running", async () => {
    const first = deferred();
    const one = dispatchThroughVideoGate({
      providers: [{ localBox: "box-a", },],
      queueWaitMs: 1_000,
      run: () => first.promise,
    },);

    // The waiter's prefix is synchronous up to its slot await, so it parks
    // before this line returns — no sleep needed before moving the clock.
    let now = 0;
    let ran = false;
    const twoRan = dispatchThroughVideoGate({
      providers: [{ localBox: "box-a", },],
      queueWaitMs: 50,
      now: () => now,
      run: async () => {
        ran = true;
      },
    },);

    now = 51;
    first.release();
    await one;
    const error = await twoRan.then(
      () => null,
      (failure: unknown,) => failure as Error & { status: number },
    );

    expect(ran,).toBe(false,);
    expect(error?.status,).toBe(429,);
  });

  test("queue-wait ceiling defaults to VIDEO_QUEUE_WAIT_MS", () => {
    expect(VIDEO_QUEUE_WAIT_MS,).toBe(300_000,);
  });
});
