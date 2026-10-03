// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for `captureWarnings` — the helper exists to stop a failed test from
 * leaving `process.emitWarning` stubbed for every other file in the suite, so
 * the thing worth pinning is that it never mutates `process` and always
 * detaches its listener.
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
});
