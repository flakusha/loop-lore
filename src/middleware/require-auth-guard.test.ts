// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import { principalKind, type PrincipalKindLiteral, } from "./principal-kind";
import {
  GUEST_READ_SHAPES,
  isAllowlisted,
  isGuestReadPath,
  isGuestReadRequest,
  isIntegrationAgentPath,
  requireAuthGuard,
  stripApiVersion,
} from "./require-auth-guard";

function req(method: string, pathname: string,): Request {
  return new Request(`http://localhost${pathname}`, { method, },);
}

/**
 * Drive the guard with a named kind. The default pins the user-JWT shape;
 * the literal still goes THROUGH the minting seam — the guard itself has
 * no default.
 */
function guardRes(
  method: string,
  pathname: string,
  userId: string | null,
  userRole: string | null,
  kind: PrincipalKindLiteral = "user",
): {
  allowed: boolean;
  status: number;
} {
  const set: { status?: number | string } = {};
  const out = requireAuthGuard({
    request: req(method, pathname,),
    userId,
    userRole,
    principalKind: principalKind(kind,),
    set,
  },);

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

describe("isIntegrationAgentPath", () => {
  test("facade REST, manifest, and MCP surfaces are integration-agent paths", () => {
    expect(isIntegrationAgentPath("/api/v1/integrations/chat.send",),).toBe(true,);
    expect(isIntegrationAgentPath("/api/integrations/chat.send",),).toBe(true,);
    expect(isIntegrationAgentPath("/api/v1/integrations/manifest",),).toBe(true,);
    expect(isIntegrationAgentPath("/api/v1/integrations/mcp",),).toBe(true,);
  });

  test("the capability manifest is an integration-agent path (segment-exact)", () => {
    // The machine-readable op manifest is an integration surface: a token
    // principal may read it, and the match stays segment-exact.
    expect(isIntegrationAgentPath("/api/v1/capabilities",),).toBe(true,);
    expect(isIntegrationAgentPath("/api/capabilities",),).toBe(true,);
    expect(isIntegrationAgentPath("/api/v1/capabilities/admin",),).toBe(false,);
    expect(isIntegrationAgentPath("/api/v1/capabilitiesx",),).toBe(false,);
  });

  test("admin token CRUD and every non-integration path are NOT", () => {
    // Tokens can never mint or revoke tokens - the CRUD surface stays JWT-admin.
    expect(isIntegrationAgentPath("/api/v1/admin/integration-tokens",),).toBe(false,);
    expect(isIntegrationAgentPath("/api/v1/chats",),).toBe(false,);
    expect(isIntegrationAgentPath("/api/v1/integrations-webhooks/x",),).toBe(false,);
    expect(isIntegrationAgentPath("/health/live",),).toBe(false,);
  });

  test("webhook receivers are NOT token-principal surfaces", () => {
    // Their authority is the per-adapter HMAC proof checked in-handler; the
    // token-principal confinement must not widen onto them.
    expect(isIntegrationAgentPath("/api/v1/integrations/webhooks/discord",),).toBe(false,);
    expect(isIntegrationAgentPath("/api/integrations/webhooks/telegram",),).toBe(false,);
  });
});

describe("requireAuthGuard - external-agent surface confinement", () => {
  const ISSUER = "admin-issuer-1";

  test("a token principal passes ONLY on integration-agent surfaces", () => {
    expect(guardRes("POST", "/api/v1/integrations/chat.send", ISSUER, null, "external-agent",).allowed,).toBe(true,);
    expect(guardRes("GET", "/api/v1/integrations/manifest", ISSUER, null, "external-agent",).allowed,).toBe(true,);
    expect(guardRes("POST", "/api/v1/integrations/mcp", ISSUER, null, "external-agent",).allowed,).toBe(true,);
    // The capability manifest is admitted for a token principal too.
    expect(guardRes("GET", "/api/v1/capabilities", ISSUER, null, "external-agent",).allowed,).toBe(true,);
  });

  test("an ANONYMOUS caller is fail-closed 401 on the capability manifest", () => {
    // The manifest is NOT a public entry: no resolved principal -> 401.
    expect(guardRes("GET", "/api/v1/capabilities", null, null, "user",),).toEqual({
      allowed: false,
      status: 401,
    },);
  });

  test("a token principal is fail-closed 401 on every other route, even with a userId", () => {
    // Issuing-admin attribution gives the principal a userId; the guard must
    // NOT let that userId wander the general API.
    expect(guardRes("POST", "/api/v1/chats", ISSUER, null, "external-agent",),).toEqual({
      allowed: false,
      status: 401,
    },);

    expect(guardRes("DELETE", "/api/v1/admin/integration-tokens/tok-1", ISSUER, null, "external-agent",),).toEqual({
      allowed: false,
      status: 401,
    },);

    expect(guardRes("GET", "/api/v1/admin/integration-tokens", ISSUER, null, "external-agent",),).toEqual({
      allowed: false,
      status: 401,
    },);
  });

  test("user JWT principals are unaffected by the confinement", () => {
    expect(guardRes("POST", "/api/v1/chats", "u-1", "user", "user",).allowed,).toBe(true,);
    // The helper's default pins the user-JWT shape; the guard itself has no
    // default — every caller names the kind (compile-enforced).
    expect(guardRes("POST", "/api/v1/chats", "u-1", "user",).allowed,).toBe(true,);
    expect(guardRes("POST", "/api/v1/worlds", "u-1", "user",).allowed,).toBe(true,);
  });

  test("internal-service and user-worktree principals are not surface-confined", () => {
    // Only external-agent is confined to the integration surfaces; the other
    // kinds keep the general-API access their user identity carries.
    expect(guardRes("POST", "/api/v1/chats", "svc-1", "user", "internal-service",).allowed,).toBe(true,);
    expect(guardRes("POST", "/api/v1/chats", "wt-1", "user", "user-worktree",).allowed,).toBe(true,);
  });

  test("a userId WITHOUT a resolved kind is rejected — no default-principal fallback", () => {
    // An identity that never passed the auth seam carries no kind; the guard
    // assumes nothing and denies (deny-by-default).
    const set: { status?: number | string } = {};
    const out = requireAuthGuard({ request: req("POST", "/api/v1/chats",), userId: "u-1", userRole: "user", set, },);
    expect(out,).not.toBeUndefined();
    if (out === undefined) { throw new Error("expected a 401 response",); }
    expect(out.status,).toBe(401,);
  });
});
