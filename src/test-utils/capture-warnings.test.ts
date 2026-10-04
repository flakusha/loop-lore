// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for `captureWarnings` — the helper exists to stop a failed test from
 * leaving `process.emitWarning` stubbed for every other file in the suite, so
 * the thing worth pinning is that it never mutates `process` and always
 * detaches its listener.
 *
 * Resource contract: this file owns nothing global, but every capture it
 * opens briefly ATTACHES a listener to the process-wide `warning` event and
 * the helper detaches it in `finally` on every exit path — success, body
 * throw, drain throw. If the runner is killed mid-capture that `finally` does
 * not run, and the orphaned listener stays attached for the life of the
 * process; it is inert (it writes to an unreachable array) but it is still a
 * live subscription. What is deliberately still shared: `process.emitWarning`
 * itself is never replaced, and the `warning` event remains a single
 * process-wide channel, so scoping is per-capture async context, not a
 * private bus. A warning emitted INSIDE the capture's own context but meant
 * for someone else is still returned — the message `filter` is what narrows
 * those, and it is optional.
 *
 * The genuine cross-file case lives in
 * `src/db/032_chat_branches_name_unique.test.ts` (this file's siblings in the
 * diff are the two migration tests): no two `src/` files can be co-loaded and
 * interleave from inside a single test file, so that test drives the same
 * race across two files in one `bun test` process. The tests below pin the
 * scoping property in isolation; the same-file ones are deliberately NOT a
 * substitute for it.
 */
import { describe, expect, spyOn, test, } from "bun:test";

import { captureWarnings, } from "./capture-warnings";

describe("captureWarnings", () => {
  test("returns the warnings the body emitted", async () => {
    const messages = await captureWarnings(async () => {
      process.emitWarning("[test] first",);
      process.emitWarning("[test] second",);
    },);

    expect(messages,).toEqual(["[test] first", "[test] second",],);
  });

  test("keeps only warnings matching the filter", async () => {
    const messages = await captureWarnings(async () => {
      process.emitWarning("noise from elsewhere",);
      process.emitWarning("[032] the one we want",);
    }, /\[032\]/,);

    expect(messages,).toEqual(["[032] the one we want",],);
  });

  test("never replaces process.emitWarning — the original keeps running", async () => {
    const real = process.emitWarning;
    await captureWarnings(async () => {
      process.emitWarning("[test] passthrough",);
    },);

    expect(process.emitWarning,).toBe(real,);
  });

  test("detaches its listener even when the body throws", async () => {
    const before = process.listenerCount("warning",);
    await expect(
      captureWarnings(async () => {
        throw new Error("body failed",);
      },),
    ).rejects.toThrow("body failed",);

    expect(process.listenerCount("warning",),).toBe(before,);
  });

  test("leaves no listener behind on the success path either", async () => {
    const before = process.listenerCount("warning",);
    await captureWarnings(async () => {
      process.emitWarning("[test] x",);
    },);

    expect(process.listenerCount("warning",),).toBe(before,);
  });

  test("a later capture does not see an earlier capture's warnings", async () => {
    await captureWarnings(async () => {
      process.emitWarning("[test] first batch",);
    },);

    const second = await captureWarnings(async () => {
      process.emitWarning("[test] second batch",);
    },);

    expect(second,).toEqual(["[test] second batch",],);
  });

  test("is a no-op for a body that warns about nothing", async () => {
    const messages = await captureWarnings(async () => {
      await Promise.resolve();
    },);

    expect(messages,).toEqual([],);
  });

  test("does not swallow a concurrent emitWarning from other code", async () => {
    // The stub this helper replaces made every other file's warnings vanish;
    // spying proves the real one is still installed and still called.
    const spy = spyOn(process, "emitWarning",);
    try {
      const messages = await captureWarnings(async () => {
        process.emitWarning("[test] observed",);
      },);

      expect(messages,).toEqual(["[test] observed",],);
      expect(spy,).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  test("a concurrent foreign emitter is excluded by the filter", async () => {
    // Both the noise and the warning under test are emitted INSIDE the
    // capture, so the async scope cannot separate them and the `filter` is the
    // only thing that can. (When the noise is emitted from a foreign context
    // instead, the scope alone drops it and the filter looks like it works
    // when it does nothing - the case the cross-file test now covers.)
    let stop = false;
    const noise = (async () => {
      let i = 0;
      while (!stop) {
        process.emitWarning(`[noise] foreign warning ${i++}`,);
        await new Promise((resolve,) => setImmediate(resolve,));
      }
    })();

    const messages = await captureWarnings(async () => {
      process.emitWarning("[032_migration] the warning under test",);
    }, /^\[032_migration\]/,);

    stop = true;
    await noise;

    expect(messages,).toEqual(["[032_migration] the warning under test",],);
  });

  test("a foreign emitter in another async context cannot inflate the count", async () => {
    // The same-file stand-in for the cross-file race: this loop is started
    // OUTSIDE the capture, so every warning it emits is dispatched from a
    // context that is not the capture's. An unscoped listener would count
    // every one of them; the count below holds with NO filter, which is the
    // property the migration tests' exact-count assertions depend on.
    // The genuine cross-file case is in
    // src/db/032_chat_branches_name_unique.test.ts - two files, one process.
    let stop = false;
    const foreign = (async () => {
      let i = 0;
      while (!stop) {
        process.emitWarning(`[foreign] other file's warning ${i++}`,);
        await new Promise((resolve,) => setImmediate(resolve,));
      }
    })();

    const messages = await captureWarnings(async () => {
      process.emitWarning("[032_migration] the warning under test",);
    },);

    stop = true;
    await foreign;

    expect(messages,).toEqual(["[032_migration] the warning under test",],);
  });

  test("a warning the body starts but does not await is still captured", async () => {
    // The scope covers the body's unawaited work too, so scoping does not
    // quietly turn into dropping the caller's own late warnings. A timer
    // scheduled inside the body carries the body's context, so this is the
    // negative of the test above: same late dispatch, own context, captured.
    const messages = await captureWarnings(async () => {
      setTimeout(() => {
        process.emitWarning("[test] body's own late warning",);
      }, 15,);

      await new Promise((resolve,) => setTimeout(resolve, 60,));
    },);

    expect(messages,).toEqual(["[test] body's own late warning",],);
  });

  test("a nested capture does not absorb the enclosing capture's warnings", async () => {
    // Each call gets its own token, so a capture opened inside another one is
    // invisible to the outer result - otherwise an inner capture would report
    // the outer's warnings and both counts would be wrong.
    const outer = await captureWarnings(async () => {
      process.emitWarning("[test] outer",);
      const inner = await captureWarnings(async () => {
        process.emitWarning("[test] inner",);
      },);

      expect(inner,).toEqual(["[test] inner",],);
    },);

    expect(outer,).toEqual(["[test] outer",],);
  });
});
