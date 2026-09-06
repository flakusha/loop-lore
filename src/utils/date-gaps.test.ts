// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import {
  formatHuman,
  formatTime,
  parseExpiryMs,
  serializeDate,
  toDate,
  tzOffset,
} from "./date";

describe("date gaps — tzOffset with IANA zones", () => {
  test("Berlin in July is +02:00 (DST)", () => {
    expect(tzOffset(new Date("2026-07-04T12:00:00Z",), "Europe/Berlin",),).toBe("+02:00",);
  });

  test("New York in January is -05:00 (EST)", () => {
    expect(tzOffset(new Date("2026-01-15T12:00:00Z",), "America/New_York",),).toBe("-05:00",);
  });

  test("UTC normalizes bare GMT to +00:00", () => {
    expect(tzOffset(new Date("2026-07-04T12:00:00Z",), "UTC",),).toBe("+00:00",);
  });

  test("invalid zone falls back to offset pattern", () => {
    expect(tzOffset(new Date("2026-07-04T12:00:00Z",), "Invalid/Zone",),).toMatch(
      /^[+-]\d{2}:\d{2}$/,
    );
  });

  test("no zone uses local offset arithmetic", () => {
    const d = new Date("2026-07-04T12:00:00Z",);
    const offsetMin = -d.getTimezoneOffset();
    const sign = offsetMin >= 0 ? "+" : "-";
    const abs = Math.abs(offsetMin,);
    const pad2 = (n: number,): string => String(n,).padStart(2, "0",);
    const expected = `${sign}${pad2(Math.floor(abs / 60,),)}:${pad2(abs % 60,)}`;
    expect(tzOffset(d,),).toBe(expected,);
  });
});

describe("date gaps — formatTime with tz", () => {
  test("standard style converts to target zone with matching offset", () => {
    expect(
      formatTime({ date: new Date("2026-07-04T14:30:00Z",), tz: "America/New_York", },),
    ).toBe("2026-07-04T10:30:00.000-04:00",);
  });

  test("compact style converts to target zone", () => {
    expect(
      formatTime({
        date: new Date("2026-07-04T08:30:00Z",),
        style: "compact",
        tz: "Europe/Berlin",
      },),
    ).toBe("20260704T103000.000+02:00",);
  });

  test("numeric timestamp input formats like the same Date", () => {
    const ms = Date.parse("2026-07-04T08:30:00Z",);
    const fromMs = formatTime({ date: ms, tz: "UTC", },);
    const fromDate = formatTime({ date: new Date(ms,), tz: "UTC", },);
    expect(fromMs,).toBe(fromDate,);
    expect(fromMs,).toBe("2026-07-04T08:30:00.000+00:00",);
  });

  test("BUG-date-formatTime-tz-drops-day-period: PM hours render as 12-hour clock", () => {
    // en-CA hour fields use a 12-hour clock, but formatTime drops the dayPeriod
    // part, so 14:30 UTC renders as "02:30" and no longer round-trips.
    expect(formatTime({ date: new Date("2026-07-04T14:30:00Z",), tz: "UTC", },),).toBe(
      "2026-07-04T02:30:00.000+00:00",
    );
  });
});

describe("date gaps — serializeDate and formatHuman", () => {
  test("unix returns epoch milliseconds", () => {
    expect(serializeDate(new Date("2026-07-04T14:30:00Z",), "unix",),).toBe(
      Date.parse("2026-07-04T14:30:00Z",),
    );
  });

  test("iso round-trips through Date.parse", () => {
    const s = serializeDate(new Date("2026-07-04T08:30:00Z",), "iso", { tz: "UTC", },);
    expect(typeof s,).toBe("string",);
    expect(Date.parse(s as string,),).toBe(Date.parse("2026-07-04T08:30:00Z",),);
  });

  test("compact omits dashes", () => {
    const s = serializeDate(new Date("2026-07-04T14:30:00Z",), "compact", { tz: "UTC", },);
    expect(s as string,).toContain("20260704",);
  });

  test("human returns a non-empty display string", () => {
    const s = serializeDate("2026-07-04T14:30:00Z", "human", {
      locale: "en-US",
      tz: "UTC",
    },);
    expect((s as string).length,).toBeGreaterThan(0,);
  });

  test("invalid input yields NaN for unix and empty string otherwise", () => {
    expect(serializeDate("bogus", "unix",),).toBeNaN();
    expect(serializeDate("bogus", "iso",),).toBe("",);
    expect(serializeDate("bogus", "human",),).toBe("",);
  });

  test("formatHuman honors date/time granularity", () => {
    const d = "2026-07-04T14:30:00Z";
    const dateOnly = formatHuman(d, { humanStyle: "date", locale: "en-US", tz: "UTC", },);
    expect(dateOnly,).toContain("2026",);
    const timeOnly = formatHuman(d, { humanStyle: "time", locale: "en-US", tz: "UTC", },);
    expect(timeOnly,).toMatch(/\d{1,2}:\d{2}/,);
  });

  test("formatHuman returns empty string for invalid input", () => {
    expect(formatHuman("bogus",),).toBe("",);
  });

  test("toDate maps empty string to Invalid Date", () => {
    expect(Number.isNaN(toDate("",).getTime(),),).toBe(true,);
  });
});

describe("date gaps — parseExpiryMs", () => {
  test("valid date string returns epoch ms", () => {
    expect(parseExpiryMs("2026-12-31T23:59:59Z",),).toBe(Date.parse("2026-12-31T23:59:59Z",),);
  });

  test("empty, garbage, and non-string inputs return null", () => {
    expect(parseExpiryMs("",),).toBeNull();
    expect(parseExpiryMs("not a date",),).toBeNull();
    expect(parseExpiryMs(undefined,),).toBeNull();
    expect(parseExpiryMs(123,),).toBeNull();
  });
});
