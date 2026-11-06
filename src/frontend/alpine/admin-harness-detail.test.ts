// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * The harness tab's shared failure classifier.
 *
 * `feFetch` REJECTS on any non-2xx (src/frontend/fe-fetch.ts:108-118), so the
 * HTTP status arrives on the thrown error, not on a Response. Without the
 * status every failure reads as "the server is down" — a 403 (not an admin)
 * and a 500 (the server refused) look identical.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { readFileSync, } from "node:fs";
import { join, } from "node:path";
import { harnessTabLoadError, harnessThrownMessage, } from "./admin-harness-detail";

const localeHost = globalThis as unknown as { __localeStrings?: unknown };
const originalLocale = localeHost.__localeStrings;

// `t()` resolves against the server-injected catalog; seed it from the real
// en.json so the messages render translated.
const EN = JSON.parse(
  readFileSync(join(import.meta.dir, "../../public/locales/en.json",), "utf8",),
) as Record<string, unknown>;

beforeEach(() => {
  localeHost.__localeStrings = EN;
},);

afterEach(() => {
  localeHost.__localeStrings = originalLocale;
},);

/** An error shaped like the one `feFetch` rejects with. */
function thrown(status: number,): Error & { status?: number } {
  return Object.assign(new Error(`HTTP ${status}`,), { status, },);
}

describe("harnessThrownMessage", () => {
  test("a 403 says the caller lacks permission", () => {
    expect(harnessThrownMessage(thrown(403,), "harness.permissions.loadFailed",),).toBe(
      "You do not have permission to view harness data.",
    );
  });

  test("an HTTP failure names the endpoint's own failure", () => {
    expect(harnessThrownMessage(thrown(500,), "harness.permissions.loadFailed",),).toBe(
      "Could not load pending permission requests.",
    );
  });

  test("a request that never got an answer says the server is unreachable", () => {
    expect(harnessThrownMessage(new Error("offline",), "harness.permissions.loadFailed",),).toBe(
      "Could not reach the harness API. Check that the server is running.",
    );
    // A zero status is the Fetch spec's "network error" — the same case.

    expect(harnessThrownMessage(thrown(0,), "harness.permissions.loadFailed",),).toBe(
      "Could not reach the harness API. Check that the server is running.",
    );
  });
});

describe("harnessTabLoadError", () => {
  test("both loads succeeded yields no message", () => {
    const ok = { status: "fulfilled", value: Response.json({},), } as const;
    expect(harnessTabLoadError(ok, ok,),).toBeNull();
  });

  test("a rejected runs load reports the runs failure", () => {
    const rejected = { status: "rejected", reason: thrown(500,), } as const;
    const ok = { status: "fulfilled", value: Response.json({},), } as const;
    expect(harnessTabLoadError(rejected, ok,),).toBe("Could not load harness runs.",);
  });

  test("a rejected stats load reports the stats failure", () => {
    const ok = { status: "fulfilled", value: Response.json({},), } as const;
    const rejected = { status: "rejected", reason: thrown(500,), } as const;
    expect(harnessTabLoadError(ok, rejected,),).toBe("Could not load harness stats.",);
  });
});
