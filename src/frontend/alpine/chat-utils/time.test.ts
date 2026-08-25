import { describe, expect, test, } from "bun:test";
import { formatHuman, } from "../../../utils/date";
import { chatUtilsTime, formatDisplayDate, } from "./time";

const iso = "2026-07-04T14:30:00Z";

/** Run fn with globalThis.currentLocale temporarily set, restoring afterward.
 *  Scoped synchronously so no other test (sequential or parallel worker) can
 *  observe the mutation — avoids shared-global flakiness. */
function withLocale(locale: string, fn: () => void,): void {
  const prev = (globalThis as any).currentLocale;
  (globalThis as any).currentLocale = locale;
  try {
    fn();
  } finally {
    (globalThis as any).currentLocale = prev;
  }
}

describe("chatUtilsTime (locale/timezone display)", () => {
  test("formatTime empty/invalid -> empty string", () => {
    expect((chatUtilsTime as any).formatTime("",),).toBe("",);
    expect((chatUtilsTime as any).formatTime("not-a-date",),).toBe("",);
  });

  test("formatTime renders a time string in the active locale", () => {
    withLocale("de-DE", () => {
      const out = (chatUtilsTime as any).formatTime(iso,);
      expect(typeof out,).toBe("string",);
      expect(out,).toMatch(/\d{1,2}:\d{2}/,);
    },);
  });

  test("formatDate renders locale/region aware date-time", () => {
    withLocale("de-DE", () => {
      const out = (chatUtilsTime as any).formatDate(iso,);
      expect(out,).toMatch(/Juli 2026/,);
    },);
  });
});

describe("bundled formatHuman (tz + locale)", () => {
  test("de-DE + Europe/Berlin", () => {
    const out = formatHuman(iso, { locale: "de-DE", tz: "Europe/Berlin", },);
    expect(out,).toMatch(/Juli 2026/,);
    expect(out,).toMatch(/16:30/,);
  });
});

describe("formatDisplayDate (shared helper)", () => {
  test("null/undefined -> empty string", () => {
    expect(formatDisplayDate(null,),).toBe("",);
    expect(formatDisplayDate(undefined,),).toBe("",);
  });

  test("invalid input -> empty string", () => {
    expect(formatDisplayDate("bad",),).toBe("",);
  });

  test("renders in active i18n locale + viewer timezone", () => {
    withLocale("de-DE", () => {
      const out = formatDisplayDate("2026-07-04T14:30:00Z", "datetime",);
      expect(out,).toMatch(/Juli 2026/,);
    },);
  });

  test("humanStyle date/time variants", () => {
    withLocale("de-DE", () => {
      expect(formatDisplayDate("2026-07-04T14:30:00Z", "date",),).toMatch(/Juli 2026/,);
      expect(formatDisplayDate("2026-07-04T14:30:00Z", "time",),).toMatch(/\d{1,2}:\d{2}/,);
    },);
  });
});
