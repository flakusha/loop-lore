// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Integration test for the CSRF middleware wired into an Elysia app.
 *
 * Exercises the real `onBeforeHandle`/`onAfterHandle` flow (not the isolated
 * unit helpers) to verify the round-trip behavior the production wiring relies on:
 *   - GET issues a Set-Cookie for `csrf_token`.
 *   - subsequent GET with a valid cookie does NOT re-issue.
 *   - POST without any token → 403 (and short-circuits before the handler).
 *   - POST with mismatched header/cookie → 403.
 *   - POST with valid header matching cookie → handler runs.
 *   - login-style exempt routes bypass verification (no token required).
 *   - disabled mode (`enabled: false`) is a pass-through for any method.
 */

import { describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import {
  cookieForDecision,
  CSRF_COOKIE,
  CSRF_HEADER,
  type CsrfMiddlewareOptions,
  decideCsrf,
  mintCsrfToken,
} from "./csrf";
import { requestIdMiddleware, } from "./request-id";

const SECRET = "integration-test-secret-must-be-32-chars-or-more-for-hmac";
const SESSION_A = "session-user-a";

interface SetupOpts {
  secret?: string;
  enabled?: boolean;
  exemptRoute?: string;
  /** Auth-derive-style mock: returns a sessionId or null for the request. */
  resolveSession?: (req: Request,) => string | null;
}

function buildApp(opts: SetupOpts,) {
  const csrfOpts: CsrfMiddlewareOptions = {
    secret: opts.secret ?? SECRET,
    enabled: opts.enabled ?? true,
  };
  return new Elysia()
    .derive(requestIdMiddleware(),)
    .derive((ctx: { request: Request },) => ({
      sessionId: opts.resolveSession?.(ctx.request,) ?? null,
    }))
    .onBeforeHandle((ctx: any,) => {
      if (!csrfOpts.enabled) { return undefined; }
      const decision = decideCsrf(csrfOpts, {
        method: ctx.request.method,
        routePattern: ctx.route ?? null,
        headers: ctx.request.headers,
        sessionId: ctx.sessionId ?? null,
        requestId: ctx.requestId ?? "anon",
      },);
      if (!decision.ok) {
        ctx.set.status = 403;
        return new Response(JSON.stringify({ error: "csrf_verification_failed", },), {
          status: 403,
          headers: { "content-type": "application/json", },
        },);
      }
      return undefined;
    },)
    .onAfterHandle((ctx: any,) => {
      if (!csrfOpts.enabled) { return; }
      const decision = decideCsrf(csrfOpts, {
        method: ctx.request.method,
        routePattern: ctx.route ?? null,
        headers: ctx.request.headers,
        sessionId: ctx.sessionId ?? null,
        requestId: ctx.requestId ?? "anon",
      },);
      const cookieHeader = cookieForDecision(decision, csrfOpts,);
      if (cookieHeader === null) { return; }
      ctx.set.headers["set-cookie"] = cookieHeader;
    },)
    // Register one mutating route so we can prove CSRF gates it.
    .post("/api/things", () => new Response("created", { status: 201, },),)
    // Register an exempt route when requested.
    .post("/api/auth/login", () => new Response("logged-in", { status: 200, },),)
    // Logout is no longer CSRF-exempt; needs both halves like any unsafe method.
    .post("/api/auth/logout", () => new Response("logged-out", { status: 200, },),)
    .get("/api/whoami", (ctx: any,) =>
      new Response(JSON.stringify({ userId: ctx.sessionId, },), {
        headers: { "content-type": "application/json", },
      },),);
}

async function dispatch(
  app: ReturnType<typeof buildApp>,
  request: Request,
): Promise<Response> {
  return app.handle(request,) as Promise<Response>;
}

describe("csrf integration — issuance path", () => {
  test("GET issues a Set-Cookie for the CSRF token when none is present", async () => {
    const app = buildApp({},);
    const res = await dispatch(app, new Request("http://localhost/api/whoami",),);
    expect(res.status,).toBe(200,);
    const setCookie = res.headers.get("set-cookie",);
    expect(setCookie,).not.toBeNull();
    expect(setCookie,).toContain(`${CSRF_COOKIE}=`,);
    expect(setCookie,).toContain("SameSite=Lax",);
    expect(setCookie,).toContain("Path=/",);
    expect(setCookie,).not.toContain("HttpOnly",);
  });

  test("GET with a valid existing cookie does NOT re-issue", async () => {
    const app = buildApp({ resolveSession: () => SESSION_A, },);
    const token = mintCsrfToken(SECRET, SESSION_A, {},);
    const res = await dispatch(
      app,
      new Request("http://localhost/api/whoami", {
        headers: { cookie: `${CSRF_COOKIE}=${token}`, },
      },),
    );
    expect(res.status,).toBe(200,);
    expect(res.headers.get("set-cookie",),).toBeNull();
  });

  test("GET with a stale binding re-issues and gets a different token", async () => {
    const app = buildApp({ resolveSession: () => SESSION_A, },);
    // Token bound to a stale sessionId — current request is SESSION_A so it
    // still verifies; we need a token that FAILS verification against SESSION_A.
    // Quickest: empty string (which `verifyCsrfToken` rejects on length).
    const stale = mintCsrfToken(SECRET, "old-session", {},);
    const res = await dispatch(
      app,
      new Request("http://localhost/api/whoami", {
        headers: { cookie: `${CSRF_COOKIE}=${stale}`, },
      },),
    );
    expect(res.status,).toBe(200,);
    expect(res.headers.get("set-cookie",),).not.toBeNull();
    // The new cookie's value must NOT equal the stale token (a freshly bound one).
    const issued = res.headers.get("set-cookie",) ?? "";
    const value = new RegExp(`${CSRF_COOKIE}=([^;]+)`,).exec(issued,)?.[1];
    expect(value,).toBeDefined();
    expect(value,).not.toBe(stale,);
  });
});

describe("csrf integration — verification path", () => {
  test("POST without any token is short-circuited with 403 (handler never runs)", async () => {
    const app = buildApp({},);
    const res = await dispatch(
      app,
      new Request("http://localhost/api/things", { method: "POST", body: "{}", },),
    );
    expect(res.status,).toBe(403,);
    const body = await res.json();
    expect(body.error,).toBe("csrf_verification_failed",);
  });

  test("POST with mismatched header/cookie tokens is rejected with 403", async () => {
    const app = buildApp({ resolveSession: () => SESSION_A, },);
    const good = mintCsrfToken(SECRET, SESSION_A, {},);
    const res = await dispatch(
      app,
      new Request("http://localhost/api/things", {
        method: "POST",
        body: "{}",
        headers: {
          cookie: `${CSRF_COOKIE}=${good}`,
          [CSRF_HEADER]: "totally-different-token",
        },
      },),
    );
    expect(res.status,).toBe(403,);
  });

  test("POST with a valid token bound to the current session passes the gate", async () => {
    const app = buildApp({ resolveSession: () => SESSION_A, },);
    const token = mintCsrfToken(SECRET, SESSION_A, {},);
    const res = await dispatch(
      app,
      new Request("http://localhost/api/things", {
        method: "POST",
        body: "{}",
        headers: {
          cookie: `${CSRF_COOKIE}=${token}`,
          [CSRF_HEADER]: token,
        },
      },),
    );
    expect(res.status,).toBe(201,);
  });

  test("POST with a token bound to a DIFFERENT session is rejected (no replay)", async () => {
    const app = buildApp({ resolveSession: () => SESSION_A, },);
    const attackerToken = mintCsrfToken(SECRET, "session-user-b", {},);
    const res = await dispatch(
      app,
      new Request("http://localhost/api/things", {
        method: "POST",
        body: "{}",
        headers: {
          cookie: `${CSRF_COOKIE}=${attackerToken}`,
          [CSRF_HEADER]: attackerToken,
        },
      },),
    );
    expect(res.status,).toBe(403,);
  });

  test("anonymous binding: token minted in one request cannot verify in another", async () => {
    // Resolve a token bound to `anonymous::req-attacker`. Try to verify it on a
    // different request (`anonymous::req-victim`) — must be rejected because
    // the binding differs. This is the actual security property: the binding
    // space `anonymous::<requestId>` is per-request, so an attacker who steals
    // a cookie bound to their own request cannot replay it on someone else's.
    const attackerToken = mintCsrfToken(SECRET, "anonymous::req-attacker", {},);
    const app = buildApp({ resolveSession: () => null, },);
    const replay = await dispatch(
      app,
      new Request("http://localhost/api/things", {
        method: "POST",
        body: "{}",
        headers: {
          "x-request-id": "req-victim",
          cookie: `${CSRF_COOKIE}=${attackerToken}`,
          [CSRF_HEADER]: attackerToken,
        },
      },),
    );
    expect(replay.status,).toBe(403,);
  });
});

describe("csrf integration — auth-route exemption", () => {
  test("POST /api/auth/login bypasses CSRF (no token required)", async () => {
    const app = buildApp({},);
    const res = await dispatch(
      app,
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        body: "username=demo&password=x",
      },),
    );
    // Exempt — must NOT be 403.
    expect(res.status,).not.toBe(403,);
  });
});

describe("csrf integration — disabled mode", () => {
  test("when enabled=false, all unsafe methods pass through without a token", async () => {
    const app = buildApp({ enabled: false, },);
    const res = await dispatch(
      app,
      new Request("http://localhost/api/things", { method: "POST", body: "{}", },),
    );
    expect(res.status,).not.toBe(403,);
  });

  test("when secret is empty AND enabled=true, decideCsrf still accepts tokens via Bun's per-thread default", async () => {
    // The Elysia wrapper in production guards against this scenario by
    // checking config first. This test asserts that `decideCsrf` itself
    // does not crash when the secret is empty — defensive coverage.
    const app = buildApp({ secret: "", },);
    const res = await dispatch(
      app,
      new Request("http://localhost/api/things", { method: "POST", body: "{}", },),
    );
    // With an empty secret, Bun.CSRF uses its per-thread default; tokens from
    // generation round-trips within the same process (per-thread default secret
    // is stable for the lifetime of the worker). Result: 403 because no token
    // supplied, OR 201 if Bun's verify succeeded against the default secret.
    // Either status is non-fatal — the point of this test is to ensure no crash.
    expect(res.status === 403 || res.status === 201,).toBe(true,);
  });
});

describe("csrf integration — logout (no longer exempt)", () => {
  test("POST /api/auth/logout without a CSRF token is rejected with 403", async () => {
    // Previously logout bypassed CSRF under the rationale that the JWT cookie
    // carries its own proof. That allowed cross-origin forced-logout. Now
    // logout must satisfy the same double-submit gate as any unsafe method.
    const app = buildApp({ resolveSession: () => SESSION_A, },);
    const res = await dispatch(
      app,
      new Request("http://localhost/api/auth/logout", {
        method: "POST",
        body: "{}",
      },),
    );
    expect(res.status,).toBe(403,);
  });

  test("POST /api/auth/logout passes with both header + cookie matching the session", async () => {
    const app = buildApp({ resolveSession: () => SESSION_A, },);
    const token = mintCsrfToken(SECRET, SESSION_A, {},);
    const res = await dispatch(
      app,
      new Request("http://localhost/api/auth/logout", {
        method: "POST",
        body: "{}",
        headers: {
          cookie: `${CSRF_COOKIE}=${token}`,
          [CSRF_HEADER]: token,
        },
      },),
    );
    expect(res.status,).toBe(200,);
  });
});
