// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * The harness overlay's pending-permission surface: the two API calls, the
 * row formatting and the queue itself (load, decide, render).
 *
 * Resource contract (parallel-safe): the fetch seam is a module-level binding
 * in ./api, restored in `afterEach`; no ports, no subprocess, no shared state.
 */
import { afterEach, describe, expect, it, } from "bun:test";
import { safeFetch, } from "../../utils";
import type { FetchResult, SafeFetchOptions, } from "../../utils/safe-fetch/types";
import { decidePermission, loadPendingPermissions, setFetch, } from "./api";
import { formatPendingPermission, formatPermissionInput, } from "./display";
import { APPROVE_KEY, DENY_KEY, PendingPermissions, } from "./pending";

afterEach(() => {
  setFetch(safeFetch,);
},);

/** One parked ask. */
const ASK = {
  id: "ask-1",
  profile: "omp-main",
  tool: "read",
  input: { path: "notes.md", },
  cwd: "/srv/project",
  arrival: 1_700_000_000_000,
};

interface Call {
  url: string;
  method: string;
}

/** Route every harness endpoint; records url + method. */
function route(body: unknown, status = 200,): Call[] {
  const calls: Call[] = [];
  const fetchStub = async (url: string, opts?: SafeFetchOptions,) => {
    calls.push({ url: new URL(url,).pathname, method: opts?.method ?? "GET", },);
    return { ok: true, data: body, status, headers: new Headers(), } as FetchResult<unknown>;
  };

  setFetch(fetchStub as Parameters<typeof setFetch>[0],);
  return calls;
}

/** A fetch stub that answers every call with a 403. */
function refuse(): void {
  const fetchStub =
    async () => ({ ok: false, error: new Error("forbidden",), status: 403, headers: new Headers(), } as FetchResult<
      unknown
    >);

  setFetch(fetchStub as Parameters<typeof setFetch>[0],);
}

describe("loadPendingPermissions", () => {
  it("reads the queued asks from the permissions endpoint", async () => {
    const calls = route({ items: [ASK,], },);

    const result = await loadPendingPermissions("tok",);

    expect(calls[0]?.url,).toBe("/api/v1/harness/permissions",);
    expect(calls[0]?.method,).toBe("GET",);
    expect(result.ok,).toBe(true,);
    expect(result.ok ? result.data.items : [],).toHaveLength(1,);
  });

  it("reports the admin-only refusal instead of an empty queue", async () => {
    refuse();

    const result = await loadPendingPermissions("tok",);

    expect(result.ok,).toBe(false,);
    expect(result.ok ? "" : result.error,).toBe("admin only",);
  });
});

describe("decidePermission", () => {
  it("posts the decision to the ask's own endpoint", async () => {
    const calls = route({ ok: true, },);

    const result = await decidePermission("ask-1", "approve", "tok",);

    expect(calls[0]?.url,).toBe("/api/v1/harness/permissions/ask-1/approve",);
    expect(calls[0]?.method,).toBe("POST",);
    expect(result.ok,).toBe(true,);
  });

  it("encodes the ask id so a stray slash cannot escape the path", async () => {
    const calls = route({ ok: true, },);

    await decidePermission("a/b", "deny", undefined,);

    expect(calls[0]?.url,).toBe("/api/v1/harness/permissions/a%2Fb/deny",);
  });
});

describe("formatPermissionInput", () => {
  it("renders a dash for an absent payload", () => {
    expect(formatPermissionInput(null,),).toBe("—",);
    expect(formatPermissionInput(undefined,),).toBe("—",);
    expect(formatPermissionInput("   ",),).toBe("—",);
  });

  it("flattens an object payload onto one line", () => {
    expect(formatPermissionInput({ path: "notes.md", },),).toBe('{"path":"notes.md"}',);
  });

  it("truncates a long payload", () => {
    const line = formatPermissionInput("x".repeat(200,),);
    expect(line.length,).toBe(60,);
    expect(line.endsWith("…",),).toBe(true,);
  });
});

describe("formatPendingPermission", () => {
  it("shows the profile, the tool and the cwd", () => {
    const line = formatPendingPermission(ASK,);
    expect(line,).toContain("omp-main",);
    expect(line,).toContain("read",);
    expect(line,).toContain("/srv/project",);
  });

  it("renders a dash for an ask without a tool kind", () => {
    const line = formatPendingPermission({ ...ASK, tool: null, },);
    expect(line,).toContain("—",);
  });
});

describe("PendingPermissions", () => {
  it("loads the queue and reports the parked asks", async () => {
    route({ items: [ASK,], },);
    const pending = new PendingPermissions();

    await pending.load("tok",);

    expect(pending.hasItems(),).toBe(true,);
    expect(pending.getItems(),).toHaveLength(1,);
    expect(pending.highlighted()?.id,).toBe("ask-1",);
  });

  it("renders nothing when no ask is parked", async () => {
    route({ items: [], },);
    const pending = new PendingPermissions();

    await pending.load("tok",);

    expect(pending.render(60, true,),).toEqual([],);
  });

  it("renders the pending block with the approve/deny hint", async () => {
    route({ items: [ASK,], },);
    const pending = new PendingPermissions();

    await pending.load("tok",);
    const rows = pending.render(60, true,).join("\n",);

    expect(rows,).toContain("Pending requests",);
    expect(rows,).toContain(APPROVE_KEY,);
    expect(rows,).toContain(DENY_KEY,);
  });

  it("decides the highlighted ask and reloads the queue", async () => {
    const calls = route({ items: [ASK,], },);
    const pending = new PendingPermissions();

    await pending.load("tok",);
    await pending.decide("approve", "tok",);

    expect(calls.map((c,) => c.method),).toEqual(["GET", "POST", "GET",],);
    expect(calls[1]?.url,).toBe("/api/v1/harness/permissions/ask-1/approve",);
  });

  it("does nothing when no ask is highlighted", async () => {
    const calls = route({ items: [], },);
    const pending = new PendingPermissions();

    await pending.load("tok",);
    await pending.decide("deny", "tok",);

    expect(calls.length,).toBe(1,);
  });

  it("keeps the queue and shows the failure when the load is refused", async () => {
    refuse();
    const pending = new PendingPermissions();

    await pending.load("tok",);

    expect(pending.hasItems(),).toBe(false,);
    expect(pending.loadError(),).toBe("admin only",);
  });
});
