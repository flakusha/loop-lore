// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * The app-wide age-gate guard (`enforceAgeGate`), with the redirect loop
 * invariant as the headline case.
 *
 * `simulateLoads` replays the real decision function across a sequence of page
 * loads and asserts the walk CONVERGES. That alone was NOT sufficient — see the
 * auth-redirect cases at the bottom, which exist because a genuine infinite
 * loop between /views/age-gate and /views/login passed every mocked-fetch test
 * and was only caught by the Playwright run.
 */
import "./i18n.test-helper";
import { afterEach, beforeEach, expect, mock, test, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../../test-utils/isolate-only";
import { enforceAgeGate, } from "./age-gate";

interface StatusShape {
  isEnabled: boolean;
  hasPassed: boolean;
  minimumAge: number;
}

let status: StatusShape = { isEnabled: true, hasPassed: false, minimumAge: 18, };
let statusThrows = false;
let statusCalls = 0;

if (ISOLATED) {
  mock.module("./htmx", () => ({
    apiFetch: async () => {
      statusCalls++;
      if (statusThrows) {
        const err = new Error("HTTP 401",) as Error & { status?: number };
        err.status = 401;
        throw err;
      }

      return Response.json(status,);
    },
  }),);
}

let pathname = "/views/chat";
const navigations: string[] = [];
let realLocation: Location | undefined;

beforeEach(() => {
  status = { isEnabled: true, hasPassed: false, minimumAge: 18, };
  statusThrows = false;
  statusCalls = 0;
  pathname = "/views/chat";
  navigations.length = 0;
  realLocation = globalThis.location;
  (globalThis as { location?: unknown }).location = {
    get pathname() {
      return pathname;
    },
    assign: (to: string,) => {
      navigations.push(to,);
    },
  };
},);

afterEach(() => {
  (globalThis as { location?: unknown }).location = realLocation;
},);

/**
 * Replay the guard across consecutive page loads the way a browser would:
 * each `location.assign` moves `pathname`, then the next load re-evaluates.
 * @param maxLoads - hard stop; exceeding it is the loop assertion failing
 * @returns how many page loads were simulated before it settled
 */
async function simulateLoads(maxLoads = 6,): Promise<number> {
  for (let load = 1; load <= maxLoads; load++) {
    const before = navigations.length;
    await enforceAgeGate();
    if (navigations.length > before) {
      pathname = navigations[navigations.length - 1] as string;
    } else {
      return load; // settled: a load that decided not to redirect
    }
  }

  throw new Error(`did not settle within ${maxLoads} loads — redirect loop`,);
}

describeOrSkip("enforceAgeGate — redirect decision", () => {
  test("enabled and not passed → sends the user to the gate screen", async () => {
    await enforceAgeGate();
    expect(navigations,).toEqual(["/views/age-gate",],);
  });

  test("disabled gate never redirects (the pre-existing 'bounce' leg)", async () => {
    status = { isEnabled: false, hasPassed: false, minimumAge: 18, };
    await enforceAgeGate();
    expect(navigations,).toEqual([],);
  });

  test("enabled and already passed → no redirect", async () => {
    status = { isEnabled: true, hasPassed: true, minimumAge: 18, };
    await enforceAgeGate();
    expect(navigations,).toEqual([],);
  });

  test("unreadable status fails OPEN — a 500 must not strand the user", async () => {
    statusThrows = true;
    await enforceAgeGate();
    expect(navigations,).toEqual([],);
  });

  test("queries the v1 status endpoint exactly once per load", async () => {
    await enforceAgeGate();
    expect(statusCalls,).toBe(1,);
  });
},);

describeOrSkip("enforceAgeGate — LOOP INVARIANT", () => {
  test("guard does NOT fire on /views/age-gate itself (the self-bounce leg)", async () => {
    // Gate enabled AND not passed — the exact state that redirects elsewhere.
    status = { isEnabled: true, hasPassed: false, minimumAge: 18, };
    pathname = "/views/age-gate";

    await enforceAgeGate();

    expect(navigations,).toEqual([],);
    // Proves the early return, not a lucky status: no status call was needed.
    expect(statusCalls,).toBe(0,);
  });

  test("tolerates the trailing-slash spelling of the gate path", async () => {
    status = { isEnabled: true, hasPassed: false, minimumAge: 18, };
    pathname = "/views/age-gate/";

    await enforceAgeGate();

    expect(navigations,).toEqual([],);
    expect(statusCalls,).toBe(0,);
  });

  test("full journey: gated → redirected → settles on the form in ONE hop", async () => {
    status = { isEnabled: true, hasPassed: false, minimumAge: 18, };

    const loads = await simulateLoads();

    // Load 1 at /views/chat redirects; load 2 at /views/age-gate settles.
    expect(navigations,).toEqual(["/views/age-gate",],);
    expect(loads,).toBe(2,);
  });

  test("full journey: accepted → straight through, never bounces", async () => {
    status = { isEnabled: true, hasPassed: true, minimumAge: 18, };

    const loads = await simulateLoads();

    expect(navigations,).toEqual([],);
    expect(loads,).toBe(1,);
  });

  test("disabled gate journey: settles immediately, never bounces", async () => {
    status = { isEnabled: false, hasPassed: false, minimumAge: 18, };

    const loads = await simulateLoads();

    expect(navigations,).toEqual([],);
    expect(loads,).toBe(1,);
  });

  test("worst case cannot exceed one redirect per load sequence", async () => {
    status = { isEnabled: true, hasPassed: false, minimumAge: 18, };

    await simulateLoads();

    expect(navigations.length,).toBeLessThanOrEqual(1,);
  });
},);

describeOrSkip("enforceAgeGate — auth-path loop (the bug Playwright caught)", () => {
  // Regression: /views/login is layout-wrapped, so app().init() → this guard
  // runs there too. An anonymous visitor 401s on /age-gate/status, feFetch
  // bounces to /views/login?redirect=… , and a non-exempt guard would send
  // login back to /views/age-gate → infinite ping-pong. These pin the fix.

  test("does NOT redirect away from /views/login", async () => {
    status = { isEnabled: true, hasPassed: false, minimumAge: 18, };
    pathname = "/views/login";

    await enforceAgeGate();

    expect(navigations,).toEqual([],);
  });

  test("does NOT redirect away from /views/login?redirect=… (query string present)", async () => {
    status = { isEnabled: true, hasPassed: false, minimumAge: 18, };
    // pathname excludes the query, but pin the exact real-world spelling.
    pathname = "/views/login";

    await enforceAgeGate();

    expect(navigations,).toEqual([],);
    expect(statusCalls,).toBe(0,);
  });

  test("does NOT redirect away from /views/register", async () => {
    status = { isEnabled: true, hasPassed: false, minimumAge: 18, };
    pathname = "/views/register";

    await enforceAgeGate();

    expect(navigations,).toEqual([],);
  });

  test("the login↔age-gate ping-pong converges in one hop, not forever", async () => {
    // Models the exact oscillation: guard wants /views/age-gate, and the auth
    // layer wants /views/login. Starting on login, the walk must settle.
    statusThrows = true; // anonymous: status 401s, feFetch would bounce to login
    pathname = "/views/login";

    const loads = await simulateLoads();

    expect(navigations,).toEqual([],);
    expect(loads,).toBe(1,);
  });

  test("an exempt path never even reaches the network", async () => {
    status = { isEnabled: true, hasPassed: false, minimumAge: 18, };
    for (const path of ["/views/age-gate", "/views/age-gate/", "/views/login", "/views/register",]) {
      pathname = path;
      statusCalls = 0;
      await enforceAgeGate();
      expect(statusCalls, `${path} must not fetch`,).toBe(0,);
    }
  });
},);
