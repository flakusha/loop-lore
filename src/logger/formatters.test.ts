/**
 * Tests for logger/formatters.ts — console pretty-print and JSONL serialization
 */

import { describe, expect, test } from "bun:test";
import { formatConsole, formatJSONL } from "./formatters";
import type { LogEntry } from "./types";

const baseEntry: LogEntry = {
  level: 20, // INFO
  timestamp: 1_800_000_000,
  time: "20260704T143000.123+02:00",
  message: "test message",
};

describe("formatConsole", () => {
  test("formats basic entry without color", () => {
    const result = formatConsole(baseEntry, false);
    expect(result).toContain("[20260704T143000.123+02:00]");
    expect(result).toContain("[INFO ]");
    expect(result).toContain("test message");
    expect(result).toEndWith("\n");
  });

  test("includes module when present", () => {
    const entry: LogEntry = { ...baseEntry, module: "auth" };
    const result = formatConsole(entry, false);
    expect(result).toContain("[auth]");
  });

  test("includes error when present", () => {
    const entry: LogEntry = { ...baseEntry, error: "failed" };
    const result = formatConsole(entry, false);
    expect(result).toContain("failed");
  });

  test("applies ANSI color when color is true", () => {
    const result = formatConsole(baseEntry, true);
    // Should contain ANSI escape sequences
    expect(result).toContain("\u{1B}[");
  });

  test("color uses cyan for INFO level", () => {
    const result = formatConsole(baseEntry, true);
    expect(result).toContain("\u{1B}[36m");
  });

  test("color uses red for ERROR level", () => {
    const entry: LogEntry = { ...baseEntry, level: 40 };
    const result = formatConsole(entry, true);
    expect(result).toContain("\u{1B}[31m");
  });

  test("color uses yellow for WARN level", () => {
    const entry: LogEntry = { ...baseEntry, level: 30 };
    const result = formatConsole(entry, true);
    expect(result).toContain("\u{1B}[33m");
  });

  test("stringifies object messages", () => {
    const entry: LogEntry = { ...baseEntry, message: { key: "val" } };
    const result = formatConsole(entry, false);
    expect(result).toContain("{\"key\":\"val\"}");
  });

  test("no color for unknown level", () => {
    const entry: LogEntry = { ...baseEntry, level: 99 };
    const result = formatConsole(entry, true);
    expect(result).toContain("99");
    // No color code applied
  });
});

describe("formatJSONL", () => {
  test("serializes basic entry as JSONL", () => {
    const result = formatJSONL(baseEntry);
    expect(result).toEndWith("\n");
    const parsed = JSON.parse(result);
    expect(parsed.level).toBe(20);
    expect(parsed.timestamp).toBe(1_800_000_000);
    expect(parsed.time).toBe("20260704T143000.123+02:00");
    expect(parsed.message).toBe("test message");
  });

  test("includes optional fields when present", () => {
    const entry: LogEntry = {
      ...baseEntry,
      module: "db",
      requestId: "req-1",
      userId: "u-1",
      sessionId: "s-1",
      error: "err",
      meta: { key: "val" },
    };
    const result = formatJSONL(entry);
    const parsed = JSON.parse(result);
    expect(parsed.module).toBe("db");
    expect(parsed.requestId).toBe("req-1");
    expect(parsed.userId).toBe("u-1");
    expect(parsed.sessionId).toBe("s-1");
    expect(parsed.error).toBe("err");
    expect(parsed.meta).toEqual({ key: "val" });
  });

  test("omits undefined optional fields", () => {
    const result = formatJSONL(baseEntry);
    const parsed = JSON.parse(result);
    expect(parsed.module).toBeUndefined();
    expect(parsed.requestId).toBeUndefined();
    expect(parsed.error).toBeUndefined();
  });

  test("omits empty meta object", () => {
    const entry: LogEntry = { ...baseEntry, meta: {} };
    const result = formatJSONL(entry);
    const parsed = JSON.parse(result);
    expect(parsed.meta).toBeUndefined();
  });

  test("stringifies object messages", () => {
    const entry: LogEntry = { ...baseEntry, message: { a: 1 } };
    const result = formatJSONL(entry);
    const parsed = JSON.parse(result);
    expect(parsed.message).toBe("{\"a\":1}");
  });
});
