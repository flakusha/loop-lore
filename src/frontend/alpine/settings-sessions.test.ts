// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { type SessionInfo, sessionsPanel, } from "./settings-sessions";

/**
 * Resource contract: this file OWNS the shared `globalThis.apiFetch` slot for
 * one test and restores it in `afterEach` — a leaked stub hijacks every other
 * suite sharing the worker (see admin-harness-race.test.ts). Each test builds
 * a fresh sessionsPanel() state so component mutations never leak.
 */
const g = globalThis as unknown as {
  apiFetch?: (url: string, opts?: RequestInit,) => Promise<Response>;
};

const originalApiFetch = g.apiFetch;
let calls: { url: string; method: string }[] = [];
let handler: ((url: string, opts?: RequestInit,) => Response) | null = null;

beforeEach(() => {
  calls = [];
  handler = null;
  g.apiFetch = async (url, opts,) => {
    calls.push({ url: String(url,), method: opts?.method ?? "GET", },);
    return handler ? handler(String(url,), opts,) : new Response("{}", { status: 500, },);
  };
},);

afterEach(() => {
  handler = null;
  calls = [];
  g.apiFetch = originalApiFetch;
},);

/** Row factory — unique ids per call so tests never share row identity. */
function row(overrides: Partial<SessionInfo> = {},): SessionInfo {
  const unique = Math.random().toString(36,).slice(2, 8,);
  return {
    id: `s-${unique}`,
    userId: "u-1",
    ip: "127.0.0.1",
    userAgent: "Test Browser/1.0",
    createdAt: "2026-10-30T10:00:00Z",
    lastActivity: "2026-10-30T12:00:00Z",
    expiresAt: "2026-10-31T10:00:00Z",
    isCurrent: false,
    ...overrides,
  };
}

function listResponse(sessions: SessionInfo[],): Response {
  return Response.json({
    data: sessions,
    pagination: { page: 1, pageSize: 50, total: sessions.length, totalPages: 1, },
  },);
}

function makeCurrent(id: string, sessions: SessionInfo[],): SessionInfo[] {
  return sessions.map((s,) => ({ ...s, isCurrent: s.id === id, }));
}

describe("sessionsPanel", () => {
  test("load renders rows and the current badge", async () => {
    handler = () => listResponse(makeCurrent("cur-1", [row({ id: "cur-1", },), row({ id: "other-1", },),],),);

    const state = sessionsPanel();
    await state.load();

    expect(calls,).toHaveLength(1,);
    expect(calls[0]?.url,).toBe("/api/v1/sessions",);
    expect(state.sessions,).toHaveLength(2,);
    expect(state.currentId,).toBe("cur-1",);
    expect(state.error,).toBeNull();
    expect(state.loading,).toBe(false,);
  });

  test("load on 401 surfaces the error state without a retry loop", async () => {
    handler = () => Response.json({ message: "Unauthorized", }, { status: 401, },);

    const state = sessionsPanel();
    await state.load();

    expect(calls,).toHaveLength(1,); // one shot — no retry loop
    expect(state.error,).not.toBeNull();
    expect(state.sessions,).toHaveLength(0,);
  });

  test("load on network failure surfaces the error state without throwing", async () => {
    g.apiFetch = async () => {
      calls.push({ url: "/api/v1/sessions", method: "GET", },);
      throw new Error("offline",);
    };

    const state = sessionsPanel();
    await state.load();

    expect(calls,).toHaveLength(1,);
    expect(state.error,).not.toBeNull();
    expect(state.loading,).toBe(false,);
  });

  test("revoke calls DELETE and removes the row", async () => {
    handler = (_url, opts,) => {
      if (opts?.method === "DELETE") { return new Response(null, { status: 204, },); }
      return listResponse([row({ id: "cur-1", isCurrent: true, },), row({ id: "victim-1", },),],);
    };

    const state = sessionsPanel();
    await state.load();
    await state.revoke("victim-1",);

    expect(calls.find((c,) => c.method === "DELETE")?.url,).toBe("/api/v1/sessions/victim-1",);
    expect(state.sessions.map((s,) => s.id),).toEqual(["cur-1",],);
    expect(state.error,).toBeNull();
  });

  test("revoke guards the current session without fetching", async () => {
    handler = () => listResponse([row({ id: "cur-1", isCurrent: true, },),],);

    const state = sessionsPanel();
    await state.load();
    await state.revoke("cur-1",);

    expect(calls.filter((c,) => c.method === "DELETE"),).toHaveLength(0,);
    expect(state.sessions,).toHaveLength(1,);
    expect(state.error,).toBeNull();
  });

  test("revoke server rejection keeps the row and surfaces the message", async () => {
    handler = (_url, opts,) => {
      if (opts?.method === "DELETE") {
        return Response.json({ message: "Cannot delete current session.", }, { status: 400, },);
      }

      return listResponse([row({ id: "cur-1", isCurrent: true, },), row({ id: "victim-1", },),],);
    };

    const state = sessionsPanel();
    await state.load();
    await state.revoke("victim-1",);

    expect(state.error,).toBe("Cannot delete current session.",);
    expect(state.sessions,).toHaveLength(2,);
  });

  test("revoke on network failure surfaces the error state", async () => {
    handler = (_url, opts,) => {
      if (opts?.method === "DELETE") { throw new Error("offline",); }
      return listResponse([row({ id: "cur-1", isCurrent: true, },), row({ id: "victim-1", },),],);
    };

    const state = sessionsPanel();
    await state.load();
    await state.revoke("victim-1",);

    expect(state.error,).not.toBeNull();
    expect(state.sessions,).toHaveLength(2,);
  });

  test("switchTo calls POST and moves the current badge via re-list", async () => {
    let postSeen = false;
    handler = (_url, opts,) => {
      if (opts?.method === "POST") {
        postSeen = true;
        return new Response("OK", { status: 200, },);
      }

      // After a switch the backend sees the new cookie: "victim-1" is current.
      return postSeen
        ? listResponse(makeCurrent("victim-1", [row({ id: "cur-1", },), row({ id: "victim-1", },),],),)
        : listResponse(makeCurrent("cur-1", [row({ id: "cur-1", },), row({ id: "victim-1", },),],),);
    };

    const state = sessionsPanel();
    await state.load();
    expect(state.currentId,).toBe("cur-1",);

    await state.switchTo("victim-1",);

    expect(calls.find((c,) => c.method === "POST")?.url,).toBe("/api/v1/sessions/victim-1/switch",);
    expect(state.currentId,).toBe("victim-1",);
    expect(state.error,).toBeNull();
  });

  test("switchTo on 410 surfaces the message and refreshes the list", async () => {
    let postSeen = false;
    handler = (_url, opts,) => {
      if (opts?.method === "POST") {
        postSeen = true;
        return Response.json({ message: "Session expired", }, { status: 410, },);
      }

      // After a 410 the victim row is gone server-side.
      return postSeen
        ? listResponse([row({ id: "cur-1", isCurrent: true, },),],)
        : listResponse([row({ id: "cur-1", isCurrent: true, },), row({ id: "victim-1", },),],);
    };

    const state = sessionsPanel();
    await state.load();
    expect(state.sessions.map((s,) => s.id),).toEqual(["cur-1", "victim-1",],);

    await state.switchTo("victim-1",);

    expect(state.error,).toBe("Session expired",);
    expect(state.sessions.map((s,) => s.id),).toEqual(["cur-1",],);
    expect(state.currentId,).toBe("cur-1",);
  });

  test("switchTo guards the current session without fetching", async () => {
    handler = () => listResponse([row({ id: "cur-1", isCurrent: true, },),],);

    const state = sessionsPanel();
    await state.load();
    await state.switchTo("cur-1",);

    expect(calls.filter((c,) => c.method === "POST"),).toHaveLength(0,);
    expect(state.error,).toBeNull();
  });

  test("switchTo on network failure surfaces the error state", async () => {
    handler = (_url, opts,) => {
      if (opts?.method === "POST") { throw new Error("offline",); }
      return listResponse([row({ id: "cur-1", isCurrent: true, },), row({ id: "other-1", },),],);
    };

    const state = sessionsPanel();
    await state.load();
    await state.switchTo("other-1",);

    expect(state.error,).not.toBeNull();
    expect(state.currentId,).toBe("cur-1",);
  });

  test("deviceLabel truncates long user agents", () => {
    const state = sessionsPanel();
    const long = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/999.0 Safari/537.36-extra";
    expect(state.deviceLabel(long,).length,).toBeLessThanOrEqual(48,);
    expect(state.deviceLabel(long,).endsWith("…",),).toBe(true,);
    expect(state.deviceLabel("Short/1.0",),).toBe("Short/1.0",);
    expect(state.deviceLabel(null,),).not.toBe("",);
  });
});
