// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Integration test for the CSRF middleware wired into an Elysia app.
 *
 * Exercises the SAME `csrfPlugin` factory that production uses (see
 * `src/middleware/csrf-plugin.ts::csrfPlugin` and
 * `src/elysia-app.ts::applyCsrfPlugin`) — NOT an inline duplicate. If
 * production wiring regresses (e.g. someone reverts
 * `ctx.set.headers["set-cookie"] = ...` back to `.append(...)`), this
 * test MUST fail.
 *
 * Coverage:
 *   - GET issues a Set-Cookie for `csrf_token`.
 *   - subsequent GET with a valid cookie does NOT re-issue.
 *   - POST without any token → 403 (and short-circuits before the handler).
 *   - POST with mismatched header/cookie → 403.
 *   - POST with valid header matching cookie → handler runs.
 *   - POST with a token bound to a DIFFERENT session → 403 (no replay).
 *   - login-style exempt routes bypass verification (no token required).
 *   - disabled mode (`enabled: false`) is a pass-through for any method.
 *   - empty-secret + enabled=true does not crash (defensive coverage).
 *   - anonymous binding: token minted for one request id is rejected on another.
 */

import { describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import { CSRF_COOKIE, CSRF_HEADER, mintCsrfToken, } from "./csrf";
import { applyCsrfPlugin, type CsrfMiddlewareOptions, } from "./csrf-plugin";
import { requestIdMiddleware, } from "./request-id";

const SECRET = "integration-test-secret-must-be-32-chars-or-more-for-hmac";
const SESSION_A = "session-user-a";

interface SetupOpts {
  secret?: string;
  enabled?: boolean;
  /** Auth-derive-style mock: returns a sessionId or null for the request. */
  resolveSession?: (req: Request,) => string | null;
}

/**
 * Build an Elysia app that runs the EXACT same CSRF wiring as production
 * (`applyCsrfPlugin`). Only differences: a synthetic auth derive that
 * resolves sessionId from the request (production uses `authenticate`),
 * and the test routes. Both `csrfPlugin.beforeHandle` and `.afterHandle`
 * are the production handlers — no copy-paste.
 */
function buildApp(opts: SetupOpts,) {
  const csrfOpts: CsrfMiddlewareOptions = {
    secret: opts.secret ?? SECRET,
    enabled: opts.enabled ?? true,
  };
  const app = new Elysia()
    .derive(requestIdMiddleware(),)
    .derive((ctx: { request: Request },) => ({
      sessionId: opts.resolveSession?.(ctx.request,) ?? null,
    }));
  applyCsrfPlugin(app as unknown as Parameters<typeof applyCsrfPlugin>[0], csrfOpts,);
  return app
    .post("/api/things", () => new Response("created", { status: 201, },),)
    .post("/api/auth/login", () => new Response("logged-in", { status: 200, },),)
    .get(
      "/api/whoami",
      (ctx: { sessionId: string | null },) =>
        new Response(JSON.stringify({ userId: ctx.sessionId, },), {
          headers: { "content-type": "application/json", },
        },),
    );
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

  test("GET with a stale binding re-issues a fresh token", async () => {
    const app = buildApp({ resolveSession: () => SESSION_A, },);
    const stale = mintCsrfToken(SECRET, "old-session", {},);
    const res = await dispatch(
      app,
      new Request("http://localhost/api/whoami", {
        headers: { cookie: `${CSRF_COOKIE}=${stale}`, },
      },),
    );
    expect(res.status,).toBe(200,);
    const issued = res.headers.get("set-cookie",) ?? "";
    expect(issued,).not.toBe("",);
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
    // Token bound to `anonymous::req-attacker` cannot verify under
    // `anonymous::req-victim`. The `anonymous::<requestId>` binding space
    // is per-request, so an attacker who steals a cookie bound to their
    // own request id cannot replay it on someone else's.
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

  test("when secret is empty AND enabled=true, the wiring does not crash", async () => {
    // Production guards against this by checking config first; this test
    // is defensive coverage that the middleware itself does not crash on
    // empty secret. With Bun's per-thread default secret, the response
    // is either 403 (no token) or 201 (token round-trips). Either is
    // non-fatal — the point is "no exception, no 500".
    const app = buildApp({ secret: "", },);
    const res = await dispatch(
      app,
      new Request("http://localhost/api/things", { method: "POST", body: "{}", },),
    );
    expect(res.status === 403 || res.status === 201,).toBe(true,);
  });
});
