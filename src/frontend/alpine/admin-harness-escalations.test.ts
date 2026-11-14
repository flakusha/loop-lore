// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Harness tab escalation slice: the recorded root-change requests load, a
 * decision is sent and the list reloads. Same fetch seam as
 * admin-harness-permissions.test.ts (globalThis.apiFetch + seeded locale
 * catalog), so the failure states render translated messages.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { readFileSync, } from "node:fs";
import { join, } from "node:path";
import type { ApiFetchMock, } from "../tests/test-types";
import {
  buildEscalationRows,
  decideHarnessEscalation,
  emptyHarnessEscalationsState,
  ESCALATIONS_URL,
  harnessEscalations,
  loadHarnessEscalations,
} from "./admin-harness-escalations";

const globalState = globalThis as unknown as {
  apiFetch?: ApiFetchMock;
  showToast?: (type: string, message: string,) => void;
};

const originalFetch = globalState.apiFetch;
const originalToast = globalState.showToast;
const localeHost = globalThis as unknown as { __localeStrings?: unknown };
const originalLocale = localeHost.__localeStrings;
let calls: string[] = [];
let methods: string[] = [];
let handler: ApiFetchMock = async () => Response.json({},);

// `t()` resolves against the server-injected catalog; seed it from the real
// en.json so the failure states render translated messages.
const EN = JSON.parse(
  readFileSync(join(import.meta.dir, "../../public/locales/en.json",), "utf8",),
) as Record<string, unknown>;

/**
 * Two recorded requests, oldest first, as the queue serves them.
 *
 * The `meta` envelope is part of the REAL body (`jsonResponse` stamps
 * `api_version` on every JSON response), so the fixture carries it: the panel
 * must keep decoding a body that carries the envelope, not a bare list.
 */
const PENDING = {
  meta: { api_version: "1", },
  items: [
    {
      id: "esc-1",
      subjectId: "user-7",
      kind: "user",
      targetPath: "packages/core",
      rationale: "the build needs the workspace root",
      createdAt: "2026-11-14 11:19:58",
    },
    {
      id: "esc-2",
      subjectId: "svc-2",
      kind: "service",
      targetPath: "/srv/loop-lore",
      rationale: "a deploy script writes here",
      createdAt: "2026-11-14 12:00:00",
    },
  ],
};

beforeEach(() => {
  calls = [];
  methods = [];
  handler = async () => Response.json({},);
  globalState.apiFetch = (url, opts,) => {
    calls.push(url,);
    methods.push(opts?.method ?? "GET",);
    return handler(url, opts,);
  };

  globalState.showToast = () => {};
  localeHost.__localeStrings = EN;
},);

afterEach(() => {
  globalState.apiFetch = originalFetch;
  globalState.showToast = originalToast;
  localeHost.__localeStrings = originalLocale;
},);

describe("loadHarnessEscalations", () => {
  test("fills the rows from the escalations endpoint", async () => {
    handler = async (url,) => {
      if (url === ESCALATIONS_URL) { return Response.json(PENDING,); }
      return new Response("", { status: 404, },);
    };

    const state = emptyHarnessEscalationsState();
    await loadHarnessEscalations(state,);

    expect(state.harnessEscalationRows.length,).toBe(2,);
    expect(state.harnessEscalationRows[0]?.subjectId,).toBe("user-7",);
    expect(state.harnessEscalationRows[0]?.kind,).toBe("user",);
    expect(state.harnessEscalationRows[0]?.targetPath,).toBe("packages/core",);
    expect(state.harnessEscalationRows[0]?.rationale,).toBe("the build needs the workspace root",);
    // The audit table stores SQLite UTC text; the cell shows a local time.
    expect(state.harnessEscalationRows[0]?.requested,).toContain("2026",);
    expect(state.harnessEscalationsError,).toBe("",);
    expect(state.harnessEscalationsUnavailable,).toBe("",);
  });

  test("an empty queue yields no rows and no error", async () => {
    handler = async () => Response.json({ items: [], },);

    const state = emptyHarnessEscalationsState();
    await loadHarnessEscalations(state,);

    expect(state.harnessEscalationRows,).toEqual([],);
    expect(state.harnessEscalationsError,).toBe("",);
    expect(state.harnessEscalationsUnavailable,).toBe("",);
  });

  test("a 403 renders the forbidden message instead of an empty table", async () => {
    handler = async () => new Response("", { status: 403, },);

    const state = emptyHarnessEscalationsState();
    await loadHarnessEscalations(state,);

    expect(state.harnessEscalationsError,).toBe("You do not have permission to view harness data.",);
    expect(state.harnessEscalationRows,).toEqual([],);
  });

  test("a failed request renders the network message", async () => {
    handler = async () => {
      throw new Error("offline",);
    };

    const state = emptyHarnessEscalationsState();
    await loadHarnessEscalations(state,);

    expect(state.harnessEscalationsError,).toBe(
      "Could not reach the harness API. Check that the server is running.",
    );
  });

  // `apiFetch` throws on a non-2xx instead of returning the Response, so the
  // real browser never reaches the response guard — the status arrives on the
  // error.
  test("a thrown 403 reports the forbidden message", async () => {
    handler = async () => {
      throw Object.assign(new Error("HTTP 403: Forbidden",), { status: 403, },);
    };

    const state = emptyHarnessEscalationsState();
    await loadHarnessEscalations(state,);

    expect(state.harnessEscalationsError,).toBe("You do not have permission to view harness data.",);
  });

  test("a thrown server error reports the endpoint's own failure", async () => {
    handler = async () => {
      throw Object.assign(new Error("HTTP 500: Internal Server Error",), { status: 500, },);
    };

    const state = emptyHarnessEscalationsState();
    await loadHarnessEscalations(state,);

    expect(state.harnessEscalationsError,).toBe("Could not load pending escalation requests.",);
  });

  // The runtime is not composed: the queue is unreachable, NOT empty. An empty
  // list here would read as "nothing to approve".
  test("a 503 says the runtime is not composed instead of showing an empty queue", async () => {
    handler = async () => new Response("", { status: 503, },);

    const state = emptyHarnessEscalationsState();
    await loadHarnessEscalations(state,);

    expect(state.harnessEscalationsUnavailable,).toBe(
      "The harness runtime is not composed, so escalation requests cannot be listed or decided.",
    );

    expect(state.harnessEscalationsError,).toBe("",);
    expect(state.harnessEscalationRows,).toEqual([],);
  });

  test("a thrown 503 says the runtime is not composed", async () => {
    handler = async () => {
      throw Object.assign(new Error("HTTP 503: Service Unavailable",), { status: 503, },);
    };

    const state = emptyHarnessEscalationsState();
    await loadHarnessEscalations(state,);

    expect(state.harnessEscalationsUnavailable,).toBe(
      "The harness runtime is not composed, so escalation requests cannot be listed or decided.",
    );

    expect(state.harnessEscalationsError,).toBe("",);
  });
});

describe("decideHarnessEscalation", () => {
  test("approve posts to the approve endpoint and reloads the list", async () => {
    handler = async (url,) => {
      if (url === `${ESCALATIONS_URL}/esc-1/approve`) { return Response.json({ ok: true, },); }
      if (url === ESCALATIONS_URL) { return Response.json(PENDING,); }
      return new Response("", { status: 404, },);
    };

    const state = emptyHarnessEscalationsState();
    await decideHarnessEscalation(state, "esc-1", "approve",);

    expect(calls,).toEqual([`${ESCALATIONS_URL}/esc-1/approve`, ESCALATIONS_URL,],);
    // The decision route is POST-only; `apiFetch` defaults to GET, so the
    // method has to be explicit or the request is never decided.
    expect(methods,).toEqual(["POST", "GET",],);
    expect(state.harnessEscalationsError,).toBe("",);
    expect(state.harnessEscalationDecidingId,).toBe("",);
  });

  test("deny posts to the deny endpoint", async () => {
    handler = async (url,) => {
      if (url === `${ESCALATIONS_URL}/esc-2/deny`) { return Response.json({ ok: true, },); }
      if (url === ESCALATIONS_URL) { return Response.json({ items: [], },); }
      return new Response("", { status: 404, },);
    };

    const state = emptyHarnessEscalationsState();
    await decideHarnessEscalation(state, "esc-2", "deny",);

    expect(calls[0],).toBe(`${ESCALATIONS_URL}/esc-2/deny`,);
    expect(state.harnessEscalationRows,).toEqual([],);
  });

  test("a rejected decision surfaces the server's own message without hiding the queue", async () => {
    handler = async (url,) => {
      if (url === ESCALATIONS_URL) { return Response.json(PENDING,); }
      return Response.json(
        { message: 'escalation request "esc-1" was already decided', code: "conflict", },
        { status: 409, },
      );
    };

    const state = emptyHarnessEscalationsState();
    await loadHarnessEscalations(state,);
    await decideHarnessEscalation(state, "esc-1", "approve",);

    // The load, then the decision — and no reload: a failed decision leaves
    // the queue exactly as it was.
    expect(calls,).toEqual([ESCALATIONS_URL, `${ESCALATIONS_URL}/esc-1/approve`,],);
    // The queue is still readable, so the load-error field stays empty: the
    // table keeps listing the requests the operator has to decide on.
    expect(state.harnessEscalationsError,).toBe("",);
    expect(state.harnessEscalationDecisionError,).toBe(
      'escalation request "esc-1" was already decided',
    );

    expect(state.harnessEscalationRows.length,).toBe(2,);
    expect(state.harnessEscalationDecidingId,).toBe("",);
  });

  test("a thrown server error on the decision reports the decision failure", async () => {
    handler = async () => {
      throw Object.assign(new Error("HTTP 500: Internal Server Error",), { status: 500, },);
    };

    const state = emptyHarnessEscalationsState();
    await decideHarnessEscalation(state, "esc-1", "approve",);

    expect(state.harnessEscalationDecisionError,).toBe("Could not record the decision.",);
  });

  test("a second decision while one is in flight is ignored", async () => {
    handler = async () => Response.json({ ok: true, },);

    const state = emptyHarnessEscalationsState();
    state.harnessEscalationDecidingId = "esc-1";
    await decideHarnessEscalation(state, "esc-2", "approve",);

    expect(calls.length,).toBe(0,);
  });
});

describe("harnessEscalations slice", () => {
  test("the refresh action loads the pending requests into the slice state", async () => {
    handler = async () => Response.json(PENDING,);

    const state = { ...harnessEscalations, };
    await harnessEscalations.refreshHarnessEscalations.call(state,);

    expect(state.harnessEscalationRows.length,).toBe(2,);
    expect(state.harnessEscalationsError,).toBe("",);
  });

  test("the answer action approves a request and reloads the queue", async () => {
    handler = async (url,) => {
      if (url === `${ESCALATIONS_URL}/esc-1/approve`) { return Response.json({ ok: true, },); }
      if (url === ESCALATIONS_URL) { return Response.json(PENDING,); }
      return new Response("", { status: 404, },);
    };

    const state = { ...harnessEscalations, };
    await harnessEscalations.answerHarnessEscalation.call(state, "esc-1", "approve",);

    expect(calls,).toEqual([`${ESCALATIONS_URL}/esc-1/approve`, ESCALATIONS_URL,],);
    expect(state.harnessEscalationRows.length,).toBe(2,);
  });
});

describe("buildEscalationRows", () => {
  test("an unparseable creation time renders the raw value", () => {
    const rows = buildEscalationRows([
      {
        id: "esc-1",
        subjectId: "user-7",
        kind: "user",
        targetPath: "packages/core",
        rationale: "the build needs the workspace root",
        createdAt: "not a date",
      },
    ],);

    expect(rows[0]?.requested,).toBe("not a date",);
  });

  test("a missing field renders the empty-value dash", () => {
    const rows = buildEscalationRows([
      {
        id: "esc-1",
        subjectId: "",
        kind: "user",
        targetPath: "packages/core",
        rationale: "",
        createdAt: "2026-11-14 11:19:58",
      },
    ],);

    expect(rows[0]?.subjectId,).toBe("\u2014",);
    expect(rows[0]?.rationale,).toBe("\u2014",);
  });
});
