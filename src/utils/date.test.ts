/**
 * Tests for utils/date.ts — date/time formatting
 */

import { describe, expect, test, } from "bun:test";
import { formatHuman, formatTime, parseExpiryMs, serializeDate, toDate, tzOffset, unixMs, unixSec, } from "./date";

describe("unixMs", () => {
  test("returns a number close to Date.now()", () => {
    const result = unixMs();
    expect(typeof result,).toBe("number",);
    expect(result,).toBeGreaterThan(0,);
    expect(Math.abs(result - Date.now(),),).toBeLessThan(100,);
  });
});

describe("unixSec", () => {
  test("returns seconds since epoch", () => {
    const result = unixSec();
    expect(typeof result,).toBe("number",);
    expect(result,).toBeGreaterThan(1_700_000_000,);
    expect(result,).toBe(Math.floor(Date.now() / 1000,),);
  });
});

describe("tzOffset", () => {
  test("returns offset string with sign and colon", () => {
    const offset = tzOffset();
    expect(offset,).toMatch(/^[+-]\d{2}:\d{2}$/,);
  });

  test("returns same format for known timezone", () => {
    const offset = tzOffset(new Date(), "UTC",);
    expect(offset,).toBe("+00:00",);
  });

  test("handles IANA timezone", () => {
    const offset = tzOffset(new Date("2026-07-04T12:00:00Z",), "America/New_York",);
    expect(offset,).toMatch(/^[+-]\d{2}:\d{2}$/,);
  });

  test("works with specific date", () => {
    const date = new Date("2026-07-04T12:00:00Z",);
    const offset = tzOffset(date, "Europe/Berlin",);
    expect(offset,).toMatch(/^[+-]\d{2}:\d{2}$/,);
    // CEST in July is +02:00
    expect(offset,).toBe("+02:00",);
  });

  test("default date is now", () => {
    const offset = tzOffset();
    expect(offset,).toMatch(/^[+-]\d{2}:\d{2}$/,);
  });
});

describe("formatTime", () => {
  test("returns ISO 8601 standard format with TZ offset", () => {
    const date = new Date("2026-07-04T14:30:00.123Z",);
    const result = formatTime({ date, },);
    // Should match ISO 8601 pattern with timezone
    expect(result,).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}/,);
  });

  test("compact style omits dashes but keeps T and TZ", () => {
    const date = new Date("2026-07-04T14:30:00.123Z",);
    const result = formatTime({ date, style: "compact", },);
    expect(result,).toMatch(/\d{8}T\d{6}\.\d{3}[+-]\d{2}:\d{2}/,);
  });

  test("standard format is parseable by Date", () => {
    const date = new Date("2026-07-04T14:30:00.123Z",);
    const result = formatTime({ date, style: "standard", },);
    const parsed = new Date(result,);
    expect(Number.isNaN(parsed.getTime(),),).toBe(false,);
  });

  test("default style is standard", () => {
    const date = new Date("2026-07-04T12:00:00Z",);
    const result = formatTime({ date, },);
    // Standard has dashes
    expect(result,).toContain("-",);
  });

  test("accepts timestamp number", () => {
    const timestamp = new Date("2026-07-04T12:00:00Z",).getTime();
    const result = formatTime({ date: timestamp, style: "standard", },);
    expect(result,).toMatch(/^\d{4}-\d{2}-\d{2}T/,);
  });

  test("no options defaults to now", () => {
    const result = formatTime();
    expect(result,).toMatch(/^\d{4}-\d{2}-\d{2}T/,);
  });

  test("respects IANA timezone", () => {
    const date = new Date("2026-07-04T12:00:00Z",);
    const result = formatTime({ date, tz: "America/New_York", style: "standard", },);
    // Should show EDT offset (-04:00 in July)
    expect(result,).toContain("-04:00",);
  });

  test("compact format with IANA timezone", () => {
    const date = new Date("2026-07-04T12:00:00Z",);
    const result = formatTime({ date, tz: "UTC", style: "compact", },);
    expect(result,).toContain("+00:00",);
    expect(result,).not.toContain("-",);
  });

  test("pads milliseconds to 3 digits", () => {
    const date = new Date("2026-07-04T00:00:00.005Z",);
    const result = formatTime({ date, tz: "UTC", style: "standard", },);
    expect(result,).toContain(".005",);
  });
});

describe("toDate", () => {
  test("returns Invalid Date for empty string", () => {
    expect(Number.isNaN(toDate("",).getTime(),),).toBe(true,);
  });

  test("defaults to now for undefined", () => {
    const d = toDate();
    expect(Number.isNaN(d.getTime(),),).toBe(false,);
  });

  test("accepts epoch ms number", () => {
    const d = toDate(1751639400000,);
    expect(d.getTime(),).toBe(1751639400000,);
  });

  test("accepts ISO string", () => {
    const d = toDate("2026-07-04T14:30:00Z",);
    expect(d.toISOString(),).toBe("2026-07-04T14:30:00.000Z",);
  });

  test("passes through a Date", () => {
    const src = new Date("2026-07-04T14:30:00Z",);
    expect(toDate(src,),).toBe(src,);
  });
});

describe("formatHuman", () => {
  const instant = "2026-07-04T14:30:00Z"; // 16:30 CEST / 23:30 JST

  test("empty/invalid input yields empty string", () => {
    expect(formatHuman("",),).toBe("",);
    expect(formatHuman("not-a-date",),).toBe("",);
  });

  test("renders locale/region aware date-time (de-DE, Berlin)", () => {
    const out = formatHuman(instant, { locale: "de-DE", tz: "Europe/Berlin", },);
    expect(out,).toMatch(/Juli 2026/,);
    expect(out,).toMatch(/16:30/,);
  });

  test("renders in Japanese locale + timezone (ja-JP, Tokyo)", () => {
    const out = formatHuman(instant, { locale: "ja-JP", tz: "Asia/Tokyo", },);
    expect(out,).toMatch(/2026/,);
    expect(out,).toMatch(/23:30/,);
  });

  test("time-only style honors locale + tz", () => {
    const out = formatHuman(instant, { locale: "en-US", tz: "America/New_York", humanStyle: "time", },);
    expect(out,).toMatch(/10:30/,);
  });
});

describe("serializeDate", () => {
  const instant = new Date("2026-07-04T14:30:00.123Z",);

  test("unix returns epoch milliseconds", () => {
    expect(serializeDate(instant, "unix",),).toBe(instant.getTime(),);
  });

  test("iso yields native-Date round-trippable string with tz offset", () => {
    const iso = serializeDate(instant, "iso", { tz: "America/New_York", },) as string;
    expect(iso,).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[-+]\d{2}:\d{2}$/,);
    expect(new Date(iso,).getTime(),).toBe(instant.getTime(),);
  });

  test("compact yields dense sortable pattern", () => {
    const out = serializeDate(instant, "compact", { tz: "UTC", },) as string;
    expect(out,).toMatch(/^\d{8}T\d{6}\.\d{3}\+00:00$/,);
  });

  test("human yields locale display", () => {
    const out = serializeDate(instant, "human", { locale: "de-DE", tz: "Europe/Berlin", },) as string;
    expect(out,).toMatch(/Juli 2026/,);
  });

  test("invalid input yields empty string for display formats (no NaN soup)", () => {
    expect(serializeDate("", "iso",),).toBe("",);
    expect(serializeDate("bad", "compact",),).toBe("",);
    expect(serializeDate("", "human",),).toBe("",);
  });

  test("invalid input yields NaN for unix", () => {
    expect(Number.isNaN(serializeDate("", "unix",) as number,),).toBe(true,);
  });
});

describe("parseExpiryMs", () => {
  test("returns null for non-string input", () => {
    expect(parseExpiryMs(undefined,),).toBeNull();
    expect(parseExpiryMs(null,),).toBeNull();
    expect(parseExpiryMs(123,),).toBeNull();
    expect(parseExpiryMs({},),).toBeNull();
    expect(parseExpiryMs([],),).toBeNull();
    expect(parseExpiryMs(true,),).toBeNull();
  });

  test("returns null for empty string", () => {
    expect(parseExpiryMs("",),).toBeNull();
  });

  test("returns null for unparseable strings", () => {
    expect(parseExpiryMs("not-a-date",),).toBeNull();
    expect(parseExpiryMs("garbage",),).toBeNull();
    expect(parseExpiryMs("2026-13-99",),).toBeNull();
  });

  test("returns epoch ms for valid ISO strings", () => {
    const iso = "2026-12-31T23:59:59.000Z";
    expect(parseExpiryMs(iso,),).toBe(Date.parse(iso,),);
  });

  test("returns epoch ms for date-only strings", () => {
    const dateOnly = "2026-12-31";
    expect(parseExpiryMs(dateOnly,),).toBe(Date.parse(dateOnly,),);
  });

  test("never returns NaN", () => {
    const inputs: unknown[] = [null, undefined, "", "garbage", "2026-13-99", "foo",];
    for (const input of inputs) {
      const result = parseExpiryMs(input,);
      expect(result === null || Number.isFinite(result,),).toBe(true,);
    }
  });
});
