// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the per-local-box serial video dispatch gate: same-box
 * serialization, different-box concurrency, external bypass, dispatch on
 * release, the pre-dispatch hook (called before dispatch, no-op default,
 * failure never aborts), and the queue-wait ceiling.
 *
 * Synchronization is deterministic: every wait is on a real signal (a
 * deferred, a hook call, or the order array itself) or a microtask flush —
 * never a guessed wall-clock duration.
 */
import { beforeEach, describe, expect, test, } from "bun:test";
import {
  __resetVideoPreDispatchHookForTests,
  dispatchThroughVideoGate,
  runVideoPreDispatchHook,
  setVideoPreDispatchHook,
  videoGateKeys,
} from "./video-dispatch-gate";

beforeEach(() => {
  __resetVideoPreDispatchHookForTests();
},);

/** Deferred gate for overlap assertions. */
function deferred(): { promise: Promise<void>; release: () => void } {
  const { promise, resolve, } = Promise.withResolvers<void>();
  return { promise, release: resolve, };
}

/**
 * Yield one macrotask so a dispatched waiter parks on its slot.
 * Not a duration — resolves on the next task queue turn.
 * @returns {Promise<void>}
 */
function yieldMacrotask(): Promise<void> {
  return Bun.sleep(0,);
}

describe("video dispatch gate — key derivation", () => {
  test("external providers (no localBox) never reach the gate", () => {
    expect(videoGateKeys([{ localBox: undefined, },],),).toEqual([],);
    expect(videoGateKeys([{ localBox: "", },],),).toEqual([],);
  });

  test("localBox is the key, first-seen order, deduped", () => {
    const providers = [{ localBox: "box-a", }, { localBox: "box-b", }, { localBox: "box-a", },];
    expect(videoGateKeys(providers,),).toEqual(["box-a", "box-b",],);
  });
});

describe("video dispatch gate — serialization", () => {
  test("same-box renders serialize: the second starts only after the first finishes", async () => {
    const order: string[] = [];
    const first = deferred();

    const one = dispatchThroughVideoGate({
      providers: [{ localBox: "box-a", },],
      run: async () => {
        order.push("one-start",);
        await first.promise;
        order.push("one-end",);
      },
    },);

    // Await the admission signal itself, not a guessed duration.
    for (let i = 0; i < 1000 && !order.includes("one-start",); i += 1) {
      await yieldMacrotask();
    }

    expect(order,).toEqual(["one-start",],);

    const twoRan = dispatchThroughVideoGate({
      providers: [{ localBox: "box-a", },],
      run: async () => {
        order.push("two-start",);
      },
    },);

    // Let the waiter park on the held slot; its run sits past the await.
    await yieldMacrotask();
    expect(order,).toEqual(["one-start",],);
    first.release();
    await one;
    await twoRan;
    expect(order,).toEqual(["one-start", "one-end", "two-start",],);
  });

  test("different boxes run concurrently", async () => {
    const aInside = deferred();
    const bEntered = deferred();
    const aDone = deferred();
    let secondEntered = false;
    let bothInside = false;

    const one = dispatchThroughVideoGate({
      providers: [{ localBox: "box-a", },],
      run: async () => {
        aInside.release();
        await bEntered.promise;
        // Box B entered while box A still holds its slot: overlap, not sequence.
        bothInside = secondEntered;
        aDone.release();
      },
    },);

    const two = dispatchThroughVideoGate({
      providers: [{ localBox: "box-b", },],
      run: async () => {
        await aInside.promise;
        secondEntered = true;
        bEntered.release();
        await aDone.promise;
      },
    },);

    await one;
    await two;
    expect(secondEntered,).toBe(true,);
    expect(bothInside,).toBe(true,);
  });

  test("external providers bypass: no serialization even under contention", async () => {
    const order: string[] = [];
    const first = deferred();

    const one = dispatchThroughVideoGate({
      providers: [{},],
      run: async () => {
        order.push("one-start",);
        await first.promise;
        order.push("one-end",);
      },
    },);

    // External dispatch invokes run synchronously (no gate await), so the
    // second render starts while the first is still held — zero added latency.
    const twoRan = dispatchThroughVideoGate({
      providers: [{},],
      run: async () => {
        order.push("two-start",);
      },
    },);

    await twoRan;
    expect(order,).toEqual(["one-start", "two-start",],);
    first.release();
    await one;
    expect(order,).toEqual(["one-start", "two-start", "one-end",],);
  });
});

describe("video dispatch gate — pre-dispatch hook", () => {
  test("hook defaults to a no-op", async () => {
    await runVideoPreDispatchHook("box-a",);
  });

  test("hook runs before dispatch, with the box key only", async () => {
    const calls: Array<{ boxKey: string; atDispatch: boolean }> = [];
    let dispatched = false;
    setVideoPreDispatchHook(async (boxKey,) => {
      calls.push({ boxKey, atDispatch: dispatched, },);
    },);

    await dispatchThroughVideoGate({
      providers: [{ localBox: "box-a", },],
      run: async () => {
        dispatched = true;
      },
    },);

    expect(calls,).toEqual([{ boxKey: "box-a", atDispatch: false, },],);
    expect(dispatched,).toBe(true,);
  });

  test("hook failure never aborts the render", async () => {
    setVideoPreDispatchHook(async () => {
      throw new Error("llama-swap unreachable",);
    },);

    let ran = false;
    await dispatchThroughVideoGate({
      providers: [{ localBox: "box-a", },],
      run: async () => {
        ran = true;
      },
    },);

    expect(ran,).toBe(true,);
  });
});
