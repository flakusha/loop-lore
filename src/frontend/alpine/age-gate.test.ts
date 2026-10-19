// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Age gate Alpine component — the redirect / submit contract against the
 * controller's JSON API.
 *
 * The apiFetch double REJECTS on any non-2xx, mirroring feFetch
 * (src/frontend/fe-fetch.ts:98-111). That is load-bearing: the component reads
 * the underage/invalid branch off `error.status`, so a stub returning a bare
 * 403 Response would leave both branches unreachable and the tests vacuous.
 */
import "./i18n.test-helper";
import { afterEach, beforeEach, expect, mock, test, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../../test-utils/isolate-only";
import "./age-gate";

interface RecordedCall {
  url: string;
  method: string;
  body: unknown;
}

/** The slice of the component this suite drives. */
interface AgeGateUnderTest {
  _birthDate: string;
  _consent: boolean;
  _error: string;
  _submitting: boolean;
  _minimumAge: number;
  canSubmit(): boolean;
  submit(): Promise<void>;
  init(): Promise<void>;
}

let calls: RecordedCall[] = [];
let handler: ((url: string, opts: RequestInit,) => Promise<Response>) | null = null;

if (ISOLATED) {
  mock.module("./htmx", () => ({
    apiFetch: async (url: string, opts?: RequestInit,) => {
      calls.push({
        url,
        method: opts?.method ?? "GET",
        body: typeof opts?.body === "string" ? JSON.parse(opts.body,) : null,
      },);

      const res = handler
        ? await handler(url, opts ?? {},)
        : Response.json({ ok: true, },);

      if (!res.ok) {
        const err = new Error(`HTTP ${res.status}`,) as Error & { status?: number };
        err.status = res.status;
        throw err;
      }

      return res;
    },
  }),);
}

/** `feFetch` rejects with an Error carrying the HTTP status; mirror that shape. */
function rejectWith(status: number,): never {
  const err = new Error(`HTTP ${status}`,) as Error & { status?: number };
  err.status = status;
  throw err;
}

// location.assign is the component's only navigation primitive.
const assignments: string[] = [];
let realLocation: Location | undefined;

beforeEach(() => {
  calls = [];
  assignments.length = 0;
  realLocation = globalThis.location;
  (globalThis as { location?: unknown }).location = {
    assign: (to: string,) => {
      assignments.push(to,);
    },
  };
},);

afterEach(() => {
  (globalThis as { location?: unknown }).location = realLocation;
},);

/** A fresh component instance — the factory carries no shared state. */
function newComponent(): AgeGateUnderTest {
  const factory = (globalThis as unknown as { ageGate: () => AgeGateUnderTest }).ageGate;
  return factory();
}

/** Status payload for a user who still owes verification. */
const GATED = { isEnabled: true, hasPassed: false, minimumAge: 18, mode: "self-declaration", };

describeOrSkip("ageGate — init redirects", () => {
  test("gate enabled and not yet passed: no redirect, states the configured minimum age", async () => {
    handler = async () => Response.json({ ...GATED, minimumAge: 21, },);
    const c = newComponent();

    await c.init();

    expect(calls[0]?.url,).toBe("/api/v1/age-gate/status",);
    expect(c._minimumAge,).toBe(21,);
    expect(assignments,).toEqual([],);
  });

  test("already-passed user is redirected away from the gate", async () => {
    handler = async () => Response.json({ isEnabled: true, hasPassed: true, minimumAge: 18, },);
    const c = newComponent();

    await c.init();

    expect(assignments,).toEqual(["/views/chat",],);
  });

  test("disabled gate (isEnabled=false) is redirected away without a form", async () => {
    handler = async () => Response.json({ isEnabled: false, hasPassed: false, minimumAge: 18, mode: "none", },);
    const c = newComponent();

    await c.init();

    expect(assignments,).toEqual(["/views/chat",],);
  });

  test("unreadable status keeps the user on the card with the default age", async () => {
    handler = async () => rejectWith(500,);
    const c = newComponent();

    await c.init();

    expect(assignments,).toEqual([],);
    expect(c._minimumAge,).toBe(18,);
  });
},);

describeOrSkip("ageGate — canSubmit gate", () => {
  test("requires both a YYYY-MM-DD date and the consent checkbox", () => {
    handler = async () => Response.json({ ok: true, },);
    const c = newComponent();

    expect(c.canSubmit(),).toBe(false,);

    c._birthDate = "1990-01-01";
    expect(c.canSubmit(),).toBe(false,); // date only — no consent

    c._consent = true;
    expect(c.canSubmit(),).toBe(true,);

    c._birthDate = "";
    expect(c.canSubmit(),).toBe(false,); // consent only — no date

    c._birthDate = "not-a-date";
    expect(c.canSubmit(),).toBe(false,);
  });
},);

describeOrSkip("ageGate — submit", () => {
  test("posts { birthDate } to /api/v1/age-gate/accept and redirects on 200", async () => {
    handler = async (url,) => (url.endsWith("/accept",) ? Response.json({ ok: true, },) : Response.json(GATED,));
    const c = newComponent();
    c._birthDate = "1990-01-01";
    c._consent = true;

    await c.submit();

    const accept = calls.find((call,) => call.url === "/api/v1/age-gate/accept");
    expect(accept?.method,).toBe("POST",);
    expect(accept?.body,).toEqual({ birthDate: "1990-01-01", },);
    expect(assignments,).toEqual(["/views/chat",],);
    expect(c._error,).toBe("",);
  });

  test("403 underage renders the minimum-age message and stays on the card", async () => {
    handler = async (
      url,
    ) => (url.endsWith("/accept",) ? rejectWith(403,) : Response.json({ ...GATED, minimumAge: 21, },));

    const c = newComponent();
    await c.init();
    c._birthDate = "2015-01-01";
    c._consent = true;

    await c.submit();

    expect(c._error,).toBe("You must be at least 21 years old to use this service.",);
    expect(assignments,).toEqual([],);
    expect(c._submitting,).toBe(false,);
  });

  test("400 malformed date renders the invalid-date message", async () => {
    handler = async (url,) => (url.endsWith("/accept",) ? rejectWith(400,) : Response.json(GATED,));
    const c = newComponent();
    c._birthDate = "1990-01-01";
    c._consent = true;

    await c.submit();

    expect(c._error,).toBe("Please enter a valid date (YYYY-MM-DD)",);
    expect(assignments,).toEqual([],);
  });

  test("a 500 surfaces the generic message, not a leaked server string", async () => {
    handler = async (url,) => (url.endsWith("/accept",) ? rejectWith(500,) : Response.json(GATED,));
    const c = newComponent();
    c._birthDate = "1990-01-01";
    c._consent = true;

    await c.submit();

    expect(c._error,).toBe("Server error. Please try again later.",);
  });

  test("an incomplete form never reaches the network", async () => {
    handler = async () => Response.json({ ok: true, },);
    const c = newComponent();
    c._birthDate = "1990-01-01"; // consent deliberately left false

    await c.submit();

    expect(calls,).toEqual([],);
    expect(assignments,).toEqual([],);
  });
},);
