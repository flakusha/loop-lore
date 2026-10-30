// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import {
  GUEST_READ_SHAPES,
  isAllowlisted,
  isGuestReadPath,
  isGuestReadRequest,
  requireAuthGuard,
  stripApiVersion,
} from "./require-auth-guard";

function req(method: string, pathname: string,): Request {
  return new Request(`http://localhost${pathname}`, { method, },);
}

function guardRes(method: string, pathname: string, userId: string | null, userRole: string | null,): {
  allowed: boolean;
  status: number;
} {
  const set: { status?: number | string } = {};
  const out = requireAuthGuard({ request: req(method, pathname,), userId, userRole, set, },);
  if (out === undefined) { return { allowed: true, status: 0, }; }
  return { allowed: false, status: out.status, };
}

describe("isAllowlisted", () => {
  test("allows auth issuance", () => {
    for (
      const p of [
        "/api/auth/login",
        "/api/v1/auth/login",
        "/api/auth/register",
        "/api/demo-login",
        "/api/v1/demo-login",
      ]
    ) {
      expect(isAllowlisted("POST", p, null,),).toBe(true,);
    }
  });

  test("allows infra probes and discovery", () => {
    for (
      const p of [
        "/api/health",
        "/api/v1/health",
        "/health/live",
        "/health/ready",
        "/metrics",
        "/nodeinfo/2.1",
        "/api/instance-state",
      ]
    ) {
      expect(isAllowlisted("GET", p, null,),).toBe(true,);
    }
  });

  test("denies guarded routes for anonymous callers", () => {
    expect(isAllowlisted("POST", "/api/worlds", null,),).toBe(false,);
    expect(isAllowlisted("POST", "/api/v1/worlds", null,),).toBe(false,);
    expect(isAllowlisted("GET", "/api/v1/chats/activity", null,),).toBe(false,);
    expect(isAllowlisted("POST", "/api/chats", null,),).toBe(false,);
  });

  test("guest GET reads pass, guest writes do not", () => {
    expect(isAllowlisted("GET", "/api/v1/worlds/abc", "guest",),).toBe(true,);
    expect(isAllowlisted("GET", "/api/v1/chats", "guest",),).toBe(true,);
    expect(isAllowlisted("GET", "/api/v1/chats/abc/messages", "guest",),).toBe(true,);
    expect(isAllowlisted("GET", "/api/v1/actors", "guest",),).toBe(true,);
    expect(isAllowlisted("POST", "/api/v1/chats", "guest",),).toBe(false,);
    expect(isAllowlisted("GET", "/api/v1/worlds/abc/factions", "guest",),).toBe(false,);
  });

  test("non-guest anonymous GET to guest paths is denied", () => {
    expect(isAllowlisted("GET", "/api/v1/worlds/abc", null,),).toBe(false,);
    expect(isAllowlisted("GET", "/api/v1/chats", null,),).toBe(false,);
  });
});

describe("requireAuthGuard", () => {
  test("authenticated requests always pass", () => {
    expect(guardRes("POST", "/api/worlds", "u-1", "user",).allowed,).toBe(true,);
    expect(guardRes("DELETE", "/api/v1/actors/x", "u-1", "user",).allowed,).toBe(true,);
  });

  test("unauthenticated POST worlds create is 401", () => {
    const r = guardRes("POST", "/api/v1/worlds", null, null,);
    expect(r.allowed,).toBe(false,);
    expect(r.status,).toBe(401,);
  });

  test("unauthenticated telemetry still passes", () => {
    expect(guardRes("POST", "/api/v1/telemetry/event", null, null,).allowed,).toBe(true,);
  });
});

describe("guest-read shape helpers", () => {
  test("guest shapes cover the read surface", () => {
    expect(GUEST_READ_SHAPES.length,).toBeGreaterThan(0,);
    expect(GUEST_READ_SHAPES,).toContainEqual(["worlds", ":id",],);
  });

  test("shape match accepts literals, rejects drift", () => {
    expect(isGuestReadPath("/chats/abc/messages",),).toBe(true,);
    expect(isGuestReadPath("/worlds/abc/factions",),).toBe(false,);
  });

  test("request check is GET-only and version-agnostic", () => {
    expect(isGuestReadRequest("GET", "/api/v1/worlds/abc",),).toBe(true,);
    expect(isGuestReadRequest("get", "/api/worlds",),).toBe(true,);
    expect(isGuestReadRequest("POST", "/api/v1/worlds/abc",),).toBe(false,);
    expect(isGuestReadRequest("GET", "/health/live",),).toBe(false,);
  });

  test("version strip handles both prefixes", () => {
    expect(stripApiVersion("/api/v1/chats",),).toBe("/chats",);
    expect(stripApiVersion("/api/chats",),).toBe("/chats",);
    expect(stripApiVersion("/health/live",),).toBeNull();
  });
});

describe("guard wired into the composed app", () => {
  test("Elysia onBeforeHandle short-circuits before the handler", async () => {
    let calls = 0;
    const app = new Elysia()
      .derive(() => ({ userId: null, userRole: null, }))
      .onBeforeHandle(requireAuthGuard as never,)
      .post("/api/v1/worlds", () => {
        calls += 1;
        return { ok: true, };
      },);

    const res = await app.handle(new Request("http://localhost/api/v1/worlds", { method: "POST", },),);
    expect(res.status,).toBe(401,);
    expect(calls,).toBe(0,);
    const body = (await res.json()) as { error: string; code: string };
    expect(body.error,).toBe("Unauthorized",);
    expect(body.code,).toBe("UNAUTHORIZED",);
  });

  test("allowlisted login passes through to the handler", async () => {
    let calls = 0;
    const app = new Elysia()
      .derive(() => ({ userId: null, userRole: null, }))
      .onBeforeHandle(requireAuthGuard as never,)
      .post("/api/v1/auth/login", () => {
        calls += 1;
        return { ok: true, };
      },);

    const res = await app.handle(new Request("http://localhost/api/v1/auth/login", { method: "POST", },),);
    expect(res.status,).toBe(200,);
    expect(calls,).toBe(1,);
  });
});
