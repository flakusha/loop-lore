// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Harness tab permission slice: the parked asks load, a decision is sent and
 * the list reloads. Same fetch seam as admin-harness.test.ts (globalThis.apiFetch
 * + seeded locale catalog), so a 403 renders the translated message.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { readFileSync, } from "node:fs";
import { join, } from "node:path";
import type { ApiFetchMock, } from "../tests/test-types";
import {
  buildPermissionRows,
  decideHarnessPermission,
  emptyHarnessPermissionsState,
  harnessPermissions,
  loadHarnessPermissions,
  PERMISSIONS_URL,
} from "./admin-harness-permissions";

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
 * Two parked asks, oldest first, as the queue serves them.
 *
 * The `meta` envelope is part of the REAL body (`jsonResponse` stamps
 * `api_version` on every JSON response), so the fixture carries it: the panel
 * must keep decoding a body that carries the envelope, not a bare list.
 */
const PENDING = {
  meta: { api_version: "1", },
  items: [
    {
      id: "ask-1",
      profile: "omp-main",
      tool: "write",
      input: { path: "notes.md", content: "hello", },
      cwd: "/srv/loop-lore",
      arrival: 1_700_000_000_000,
    },
    {
      id: "ask-2",
      profile: "cc-sub",
      tool: null,
      input: { command: "ls", },
      cwd: "/srv/loop-lore",
      arrival: 1_700_000_001_000,
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

describe("loadHarnessPermissions", () => {
  test("fills the rows from the permissions endpoint", async () => {
    handler = async (url,) => {
      if (url === PERMISSIONS_URL) { return Response.json(PENDING,); }
      return new Response("", { status: 404, },);
    };

    const state = emptyHarnessPermissionsState();
    await loadHarnessPermissions(state,);

    expect(state.harnessPermissionRows.length,).toBe(2,);
    expect(state.harnessPermissionRows[0]?.profile,).toBe("omp-main",);
    expect(state.harnessPermissionRows[0]?.tool,).toBe("write",);
    expect(state.harnessPermissionRows[0]?.cwd,).toBe("/srv/loop-lore",);
    expect(state.harnessPermissionRows[0]?.input,).toContain("notes.md",);
    // A null tool renders the empty-value dash, not the string "null".
    expect(state.harnessPermissionRows[1]?.tool,).toBe("\u2014",);
    expect(state.harnessPermissionsError,).toBe("",);
  });

  test("an empty queue yields no rows and no error", async () => {
    handler = async () => Response.json({ items: [], },);

    const state = emptyHarnessPermissionsState();
    await loadHarnessPermissions(state,);

    expect(state.harnessPermissionRows,).toEqual([],);
    expect(state.harnessPermissionsError,).toBe("",);
  });

  test("a 403 renders the forbidden message instead of an empty table", async () => {
    handler = async () => new Response("", { status: 403, },);

    const state = emptyHarnessPermissionsState();
    await loadHarnessPermissions(state,);

    expect(state.harnessPermissionsError,).toBe("You do not have permission to view harness data.",);
    expect(state.harnessPermissionRows,).toEqual([],);
  });

  test("a failed request renders the network message", async () => {
    handler = async () => {
      throw new Error("offline",);
    };

    const state = emptyHarnessPermissionsState();
    await loadHarnessPermissions(state,);

    expect(state.harnessPermissionsError,).toBe(
      "Could not reach the harness API. Check that the server is running.",
    );
  });

  // `apiFetch` throws on a non-2xx instead of returning the Response, so the
  // real browser never reaches the response guard — the status arrives on the
  // error. A 403 is "not an admin", not "the server is down".
  test("a thrown 403 reports the forbidden message", async () => {
    handler = async () => {
      throw Object.assign(new Error("HTTP 403: Forbidden",), { status: 403, },);
    };

    const state = emptyHarnessPermissionsState();
    await loadHarnessPermissions(state,);

    expect(state.harnessPermissionsError,).toBe("You do not have permission to view harness data.",);
  });

  test("a thrown server error reports the endpoint's own failure", async () => {
    handler = async () => {
      throw Object.assign(new Error("HTTP 500: Internal Server Error",), { status: 500, },);
    };

    const state = emptyHarnessPermissionsState();
    await loadHarnessPermissions(state,);

    expect(state.harnessPermissionsError,).toBe("Could not load pending permission requests.",);
  });
});

describe("decideHarnessPermission", () => {
  test("approve posts to the approve endpoint and reloads the list", async () => {
    handler = async (url,) => {
      if (url === `${PERMISSIONS_URL}/ask-1/approve`) { return Response.json({ ok: true, },); }
      if (url === PERMISSIONS_URL) { return Response.json(PENDING,); }
      return new Response("", { status: 404, },);
    };

    const state = emptyHarnessPermissionsState();
    await decideHarnessPermission(state, "ask-1", "approve",);

    expect(calls,).toEqual([`${PERMISSIONS_URL}/ask-1/approve`, PERMISSIONS_URL,],);
    // The decision route is POST-only; `apiFetch` defaults to GET, so the
    // method has to be explicit or the ask is never decided.
    expect(methods,).toEqual(["POST", "GET",],);
    expect(state.harnessPermissionsError,).toBe("",);
    expect(state.harnessDecidingId,).toBe("",);
  });

  test("deny posts to the deny endpoint", async () => {
    handler = async (url,) => {
      if (url === `${PERMISSIONS_URL}/ask-2/deny`) { return Response.json({ ok: true, },); }
      if (url === PERMISSIONS_URL) { return Response.json({ items: [], },); }
      return new Response("", { status: 404, },);
    };

    const state = emptyHarnessPermissionsState();
    await decideHarnessPermission(state, "ask-2", "deny",);

    expect(calls[0],).toBe(`${PERMISSIONS_URL}/ask-2/deny`,);
    expect(state.harnessPermissionRows,).toEqual([],);
  });

  test("a rejected decision reports the failure without hiding the queue", async () => {
    handler = async (url,) => {
      if (url === PERMISSIONS_URL) { return Response.json(PENDING,); }
      return new Response("nope", { status: 500, },);
    };

    const state = emptyHarnessPermissionsState();
    await loadHarnessPermissions(state,);
    await decideHarnessPermission(state, "ask-1", "approve",);

    // The load, then the decision — and no reload: a failed decision leaves
    // the queue exactly as it was.
    expect(calls,).toEqual([PERMISSIONS_URL, `${PERMISSIONS_URL}/ask-1/approve`,],);
    // The queue is still readable, so the load-error field stays empty: the
    // table keeps listing the parked asks the operator has to decide on.
    expect(state.harnessPermissionsError,).toBe("",);
    expect(state.harnessDecisionError,).toBe("Could not record the decision.",);
    expect(state.harnessPermissionRows.length,).toBe(2,);
    expect(state.harnessDecidingId,).toBe("",);
  });

  test("a thrown server error on the decision reports the decision failure", async () => {
    handler = async () => {
      throw Object.assign(new Error("HTTP 503: Service Unavailable",), { status: 503, },);
    };

    const state = emptyHarnessPermissionsState();
    await decideHarnessPermission(state, "ask-1", "approve",);

    expect(state.harnessDecisionError,).toBe("Could not record the decision.",);
  });

  test("a second decision while one is in flight is ignored", async () => {
    handler = async () => Response.json({ ok: true, },);

    const state = emptyHarnessPermissionsState();
    state.harnessDecidingId = "ask-1";
    await decideHarnessPermission(state, "ask-2", "approve",);

    expect(calls.length,).toBe(0,);
  });
});

describe("harnessPermissions slice", () => {
  test("the refresh action loads the parked asks into the slice state", async () => {
    handler = async () => Response.json(PENDING,);

    const state = { ...harnessPermissions, };
    await harnessPermissions.refreshHarnessPermissions.call(state,);

    expect(state.harnessPermissionRows.length,).toBe(2,);
    expect(state.harnessPermissionsError,).toBe("",);
  });

  test("the answer action approves an ask and reloads the queue", async () => {
    handler = async (url,) => {
      if (url === `${PERMISSIONS_URL}/ask-1/approve`) { return Response.json({ ok: true, },); }
      if (url === PERMISSIONS_URL) { return Response.json(PENDING,); }
      return new Response("", { status: 404, },);
    };

    const state = { ...harnessPermissions, };
    await harnessPermissions.answerHarnessPermission.call(state, "ask-1", "approve",);

    expect(calls,).toEqual([`${PERMISSIONS_URL}/ask-1/approve`, PERMISSIONS_URL,],);
    expect(state.harnessPermissionRows.length,).toBe(2,);
  });
});

describe("buildPermissionRows", () => {
  test("a long raw input is capped so the table stays one line", () => {
    const rows = buildPermissionRows([
      { id: "ask-1", profile: "p", tool: "write", input: { blob: "x".repeat(500,), }, cwd: "/tmp", arrival: 0, },
    ],);

    expect(rows[0]?.input.length,).toBeLessThanOrEqual(160,);
  });

  test("a long string input is capped too", () => {
    const rows = buildPermissionRows([
      { id: "ask-1", profile: "p", tool: "write", input: "x".repeat(500,), cwd: "/tmp", arrival: 0, },
    ],);

    expect(rows[0]?.input.length,).toBeLessThanOrEqual(160,);
  });

  test("a multi-line string input renders as one line", () => {
    const rows = buildPermissionRows([
      { id: "ask-1", profile: "p", tool: "write", input: "line one\nline two", cwd: "/tmp", arrival: 0, },
    ],);

    expect(rows[0]?.input,).toBe("line one line two",);
  });

  test("a missing input renders the empty-value dash", () => {
    const rows = buildPermissionRows([
      { id: "ask-1", profile: "p", tool: null, input: null, cwd: "/tmp", arrival: 0, },
    ],);

    expect(rows[0]?.input,).toBe("\u2014",);
  });
});
