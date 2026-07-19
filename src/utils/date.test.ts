/**
 * Tests for utils/date.ts — date/time formatting
 */

import { describe, expect, test } from "bun:test";
import { formatTime, tzOffset, unixMs, unixSec } from "./date";

describe("unixMs", () => {
  test("returns a number close to Date.now()", () => {
    const result = unixMs();
    expect(typeof result).toBe("number");
    expect(result).toBeGreaterThan(0);
    expect(Math.abs(result - Date.now())).toBeLessThan(100);
  });
});

describe("unixSec", () => {
  test("returns seconds since epoch", () => {
    const result = unixSec();
    expect(typeof result).toBe("number");
    expect(result).toBeGreaterThan(1_700_000_000);
    expect(result).toBe(Math.floor(Date.now() / 1000));
  });
});

describe("tzOffset", () => {
  test("returns offset string with sign and colon", () => {
    const offset = tzOffset();
    expect(offset).toMatch(/^[+-]\d{2}:\d{2}$/);
  });

  test("returns same format for known timezone", () => {
    const offset = tzOffset(new Date(), "UTC");
    expect(offset).toBe("+00:00");
  });

  test("handles IANA timezone", () => {
    const offset = tzOffset(new Date("2026-07-04T12:00:00Z"), "America/New_York");
    expect(offset).toMatch(/^[+-]\d{2}:\d{2}$/);
  });

  test("works with specific date", () => {
    const date = new Date("2026-07-04T12:00:00Z");
    const offset = tzOffset(date, "Europe/Berlin");
    expect(offset).toMatch(/^[+-]\d{2}:\d{2}$/);
    // CEST in July is +02:00
    expect(offset).toBe("+02:00");
  });

  test("default date is now", () => {
    const offset = tzOffset();
    expect(offset).toMatch(/^[+-]\d{2}:\d{2}$/);
  });
});

describe("formatTime", () => {
  test("returns ISO 8601 standard format with TZ offset", () => {
    const date = new Date("2026-07-04T14:30:00.123Z");
    const result = formatTime({ date });
    // Should match ISO 8601 pattern with timezone
    expect(result).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}/);
  });

  test("compact style omits dashes but keeps T and TZ", () => {
    const date = new Date("2026-07-04T14:30:00.123Z");
    const result = formatTime({ date, style: "compact" });
    expect(result).toMatch(/\d{8}T\d{6}\.\d{3}[+-]\d{2}:\d{2}/);
  });

  test("standard format is parseable by Date", () => {
    const date = new Date("2026-07-04T14:30:00.123Z");
    const result = formatTime({ date, style: "standard" });
    const parsed = new Date(result);
    expect(Number.isNaN(parsed.getTime())).toBe(false);
  });

  test("default style is standard", () => {
    const date = new Date("2026-07-04T12:00:00Z");
    const result = formatTime({ date });
    // Standard has dashes
    expect(result).toContain("-");
  });

  test("accepts timestamp number", () => {
    const timestamp = new Date("2026-07-04T12:00:00Z").getTime();
    const result = formatTime({ date: timestamp, style: "standard" });
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test("no options defaults to now", () => {
    const result = formatTime();
    expect(result).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  test("respects IANA timezone", () => {
    const date = new Date("2026-07-04T12:00:00Z");
    const result = formatTime({ date, tz: "America/New_York", style: "standard" });
    // Should show EDT offset (-04:00 in July)
    expect(result).toContain("-04:00");
  });

  test("compact format with IANA timezone", () => {
    const date = new Date("2026-07-04T12:00:00Z");
    const result = formatTime({ date, tz: "UTC", style: "compact" });
    expect(result).toContain("+00:00");
    expect(result).not.toContain("-");
  });

  test("pads milliseconds to 3 digits", () => {
    const date = new Date("2026-07-04T00:00:00.005Z");
    const result = formatTime({ date, tz: "UTC", style: "standard" });
    expect(result).toContain(".005");
  });
});
