// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * CSRF plugin coverage — the 403 response shape, beforeHandle allow/deny
 * wiring, afterHandle Set-Cookie issuance, and applyCsrfPlugin registration,
 * exercised through structural fake contexts (no Elysia import needed).
 */
import { describe, expect, test, } from "bun:test";
import { mintCsrfToken, } from "./csrf.js";
import type { CsrfMiddlewareOptions, } from "./csrf.js";
import { applyCsrfPlugin, csrfForbiddenResponse, csrfPlugin, } from "./csrf-plugin.js";

const OPTS: CsrfMiddlewareOptions = {
  secret: "test-csrf-secret-0123456789abcdef",
  enabled: true,
  cookieSecureOverride: false,
};

/** Fake Elysia `onBeforeHandle` context. */
function fakeCtx(init: {
  method: string;
  route: string | null;
  headers?: Record<string, string>;
  sessionId?: string | null;
  requestId?: string;
},): {
  request: Request;
  route: string | null;
  requestId: string;
  sessionId: string | null;
  set: { status?: number; headers: Record<string, string | string[] | undefined> };
} {
  return {
    request: new Request("http://localhost/api/chat", {
      method: init.method,
      headers: init.headers ?? {},
    },),
    route: init.route,
    requestId: init.requestId ?? "req-1",
    sessionId: init.sessionId ?? null,
    set: { headers: {}, },
  };
}

describe("csrfForbiddenResponse", () => {
  test("returns a 403 JSON body with the stable error code", async () => {
    const res = csrfForbiddenResponse();
    expect(res.status,).toBe(403,);
    expect(res.headers.get("content-type"),).toContain("application/json",);
    const body = (await res.json()) as { error: string; message: string };
    expect(body.error,).toBe("csrf_verification_failed",);
    expect(typeof body.message,).toBe("string",);
  });
});

describe("csrfPlugin.beforeHandle", () => {
  test("lets safe methods through without short-circuiting", () => {
    const plugin = csrfPlugin(OPTS,);
    const ctx = fakeCtx({ method: "GET", route: "/api/chat", },);
    expect(plugin.beforeHandle(ctx,),).toBeUndefined();
    expect(ctx.set.status,).toBeUndefined();
  });

  test("rejects unsafe requests without tokens and marks 403", () => {
    const plugin = csrfPlugin(OPTS,);
    const ctx = fakeCtx({ method: "POST", route: "/api/chat", sessionId: "sess-1", },);
    const res = plugin.beforeHandle(ctx,);
    expect(res,).toBeInstanceOf(Response,);
    expect((res as Response).status,).toBe(403,);
    expect(ctx.set.status,).toBe(403,);
  });

  test("rejects mismatched header/cookie pairs", () => {
    const plugin = csrfPlugin(OPTS,);
    const ctx = fakeCtx({
      method: "POST",
      route: "/api/chat",
      headers: { "X-CSRF-Token": "aaa", Cookie: "csrf_token=bbb", },
      sessionId: "sess-1",
    },);
    expect(plugin.beforeHandle(ctx,)?.status,).toBe(403,);
  });

  test("accepts a valid double-submit pair bound to the session", () => {
    const plugin = csrfPlugin(OPTS,);
    const token = mintCsrfToken(OPTS.secret, "sess-9", {},);
    const ctx = fakeCtx({
      method: "POST",
      route: "/api/chat",
      headers: { "X-CSRF-Token": token, Cookie: `csrf_token=${token}`, },
      sessionId: "sess-9",
    },);
    expect(plugin.beforeHandle(ctx,),).toBeUndefined();
  });

  test("lets exempt session-minting routes through without tokens", () => {
    const plugin = csrfPlugin(OPTS,);
    const ctx = fakeCtx({ method: "POST", route: "/api/auth/login", },);
    expect(plugin.beforeHandle(ctx,),).toBeUndefined();
    expect(ctx.set.status,).toBeUndefined();
  });

  test("accepts pre-auth requests bound to the request id", () => {
    const plugin = csrfPlugin(OPTS,);
    const token = mintCsrfToken(OPTS.secret, "anonymous::req-7", {},);
    const ctx = fakeCtx({
      method: "POST",
      route: "/api/chat",
      headers: { "X-CSRF-Token": token, Cookie: `csrf_token=${token}`, },
      requestId: "req-7",
    },);
    expect(plugin.beforeHandle(ctx,),).toBeUndefined();
  });

  test("disabled middleware is a pass-through even without tokens", () => {
    const plugin = csrfPlugin({ ...OPTS, enabled: false, },);
    const ctx = fakeCtx({ method: "DELETE", route: "/api/chat", },);
    expect(plugin.beforeHandle(ctx,),).toBeUndefined();
  });

  test("missing route pattern still enforces unsafe methods", () => {
    const plugin = csrfPlugin(OPTS,);
    const ctx = fakeCtx({ method: "POST", route: null, },);
    expect(plugin.beforeHandle(ctx,)?.status,).toBe(403,);
  });
});

describe("csrfPlugin.afterHandle", () => {
  test("issues a Set-Cookie for safe methods without a token", () => {
    const plugin = csrfPlugin(OPTS,);
    const ctx = fakeCtx({ method: "GET", route: "/api/chat", },);
    plugin.afterHandle(ctx,);
    const setCookie = ctx.set.headers["set-cookie"];
    expect(typeof setCookie,).toBe("string",);
    expect(String(setCookie,),).toContain("csrf_token=",);
  });

  test("does not re-issue when the client already holds a valid token", () => {
    const plugin = csrfPlugin(OPTS,);
    const token = mintCsrfToken(OPTS.secret, "sess-3", {},);
    const ctx = fakeCtx({
      method: "GET",
      route: "/api/chat",
      headers: { Cookie: `csrf_token=${token}`, },
      sessionId: "sess-3",
    },);
    plugin.afterHandle(ctx,);
    expect(ctx.set.headers["set-cookie"],).toBeUndefined();
  });

  test("verified unsafe requests do not set a cookie", () => {
    const plugin = csrfPlugin(OPTS,);
    const token = mintCsrfToken(OPTS.secret, "sess-4", {},);
    const ctx = fakeCtx({
      method: "POST",
      route: "/api/chat",
      headers: { "X-CSRF-Token": token, Cookie: `csrf_token=${token}`, },
      sessionId: "sess-4",
    },);
    plugin.afterHandle(ctx,);
    expect(ctx.set.headers["set-cookie"],).toBeUndefined();
  });
});

describe("applyCsrfPlugin", () => {
  test("registers both callbacks on the app", () => {
    const seen: string[] = [];
    const app = {
      onBeforeHandle(cb: (ctx: unknown,) => unknown,): void {
        seen.push("before",);
        expect(typeof cb,).toBe("function",);
      },
      onAfterHandle(cb: (ctx: unknown,) => void,): void {
        seen.push("after",);
        expect(typeof cb,).toBe("function",);
      },
    };
    applyCsrfPlugin(app, OPTS,);
    expect(seen,).toEqual(["before", "after",],);
  });

  test("wired callbacks enforce and issue end to end", () => {
    let before!: (ctx: unknown,) => unknown;
    let after!: (ctx: unknown,) => void;
    const app = {
      onBeforeHandle(cb: (ctx: unknown,) => unknown,): void {
        before = cb;
      },
      onAfterHandle(cb: (ctx: unknown,) => void,): void {
        after = cb;
      },
    };
    applyCsrfPlugin(app, OPTS,);

    const blocked = fakeCtx({ method: "POST", route: "/api/chat", },);
    expect((before(blocked,) as Response | undefined)?.status,).toBe(403,);

    const issued = fakeCtx({ method: "GET", route: "/api/chat", },);
    expect(before(issued,),).toBeUndefined();
    after(issued,);
    expect(String(issued.set.headers["set-cookie"] ?? "",),).toContain("csrf_token=",);
  });
});
