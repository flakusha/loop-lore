/**
 * Tests for logger/limits.ts — log entry size limits
 */

import { describe, test, expect } from "bun:test";
import { applyLimits } from "./limits";
import type { LogEntry } from "./types";

const baseEntry: LogEntry = {
  level: 20,
  timestamp: 1_800_000_000,
  time: "20260704T143000.123+02:00",
  message: "short message",
};

describe("applyLimits", () => {
  test("passes through entry under all limits", () => {
    const result = applyLimits(baseEntry);
    expect(result.message).toBe("short message");
  });

  test("truncates long message strings", () => {
    const long = "a".repeat(20_000);
    const result = applyLimits({ ...baseEntry, message: long }, { maxMessageBytes: 100 });
    expect(typeof result.message).toBe("string");
    expect((result.message as string).length).toBeLessThan(long.length);
    expect(result.message as string).toContain("[truncated");
  });

  test("truncates error stack", () => {
    const longStack = "x".repeat(10_000);
    const result = applyLimits({ ...baseEntry, error: longStack }, { maxStackBytes: 100 });
    expect(result.error!.length).toBeLessThan(longStack.length);
    expect(result.error).toContain("[truncated");
  });

  test("truncates large meta objects", () => {
    const large: Record<string, unknown> = {};
    for (let i = 0; i < 300; i++) large[`key${i}`] = `value${i}`;
    const result = applyLimits(
      { ...baseEntry, meta: large },
      { maxMetaBytes: 1000, maxMetaDepth: 3, maxMetaEntries: 5 },
    );
    expect(result.meta).toBeDefined();
    expect(Object.keys(result.meta!).length).toBeLessThan(300);
  });

  test("respects maxMetaDepth", () => {
    const deep: Record<string, unknown> = {
      a: { b: { c: { d: { e: { f: "val" } } } } },
    };
    const result = applyLimits({ ...baseEntry, meta: deep }, { maxMetaDepth: 0 });
    const a = result.meta!.a as Record<string, unknown>;
    // At depth 0, we don't descend
    expect(typeof a).toBe("object");
  });

  test("truncates object message with too many keys", () => {
    const msg: Record<string, unknown> = {};
    for (let i = 0; i < 200; i++) msg[`k${i}`] = i;
    const result = applyLimits({ ...baseEntry, message: msg }, { maxMessageKeys: 10 });
    expect(typeof result.message).toBe("object");
    const keys = Object.keys(result.message as Record<string, unknown>);
    expect(keys.length).toBeLessThan(200);
    expect(keys).toContain("[truncated]");
  });

  test("does not truncate message within limits", () => {
    const result = applyLimits({ ...baseEntry, message: "ok" }, { maxMessageBytes: 1000 });
    expect(result.message).toBe("ok");
  });

  test("uses default limits when no overrides", () => {
    const result = applyLimits(baseEntry);
    expect(result.message).toBe(baseEntry.message);
  });

  test("does not mutate original entry", () => {
    const original = { ...baseEntry, error: "test error" };
    const result = applyLimits(original, { maxStackBytes: 50 });
    // Original error unchanged
    expect(original.error).toBe("test error");
    // Result is a copy
    expect(result).not.toBe(original);
  });

  test("empty meta yields empty object", () => {
    const result = applyLimits({ ...baseEntry, meta: {} });
    expect(result.meta).toEqual({});
  });

  test("string message is not truncated if under limit", () => {
    const result = applyLimits({ ...baseEntry, message: "hello" }, { maxMessageBytes: 1000 });
    expect(result.message).toBe("hello");
  });
});
