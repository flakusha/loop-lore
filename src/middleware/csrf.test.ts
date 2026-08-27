// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import {
  buildCsrfCookie,
  cookieForDecision,
  CSRF_COOKIE,
  CSRF_HEADER,
  decideCsrf,
  mintCsrfToken,
  readCsrfCookie,
  resolveCookieSecure,
  verifyCsrfToken,
} from "./csrf";

const SECRET = "test-secret-do-not-use-in-prod-min-32-chars-required-here";
const ALT_SECRET = "different-secret-also-needs-min-32-chars-for-hmac-stability";

function makeHeaders(parts: Record<string, string>,): Headers {
  const h = new Headers();
  for (const [k, v,] of Object.entries(parts,)) { h.set(k, v,); }
  return h;
}

describe("csrf helpers", () => {
  test("mintCsrfToken + verifyCsrfToken round-trip with matching sessionId", () => {
    const token = mintCsrfToken(SECRET, "user-123", {},);
    expect(typeof token,).toBe("string",);
    expect(token.length,).toBeGreaterThan(20,);
    expect(verifyCsrfToken(SECRET, token, "user-123",),).toBe(true,);
  });

  test("verifyCsrfToken rejects token bound to a different sessionId", () => {
    const token = mintCsrfToken(SECRET, "user-a", {},);
    expect(verifyCsrfToken(SECRET, token, "user-b",),).toBe(false,);
  });

  test("verifyCsrfToken rejects token signed with a different secret", () => {
    const token = mintCsrfToken(SECRET, "user-x", {},);
    expect(verifyCsrfToken(ALT_SECRET, token, "user-x",),).toBe(false,);
  });

  test("verifyCsrfToken rejects empty input", () => {
    expect(verifyCsrfToken(SECRET, "", "user-x",),).toBe(false,);
  });

  test("verifyCsrfToken rejects malformed token", () => {
    expect(verifyCsrfToken(SECRET, "not-a-token", "user-x",),).toBe(false,);
  });
});

describe("readCsrfCookie", () => {
  test("extracts the cookie when present in a single-cookie header", () => {
    expect(readCsrfCookie(`${CSRF_COOKIE}=abc.def`,),).toBe("abc.def",);
  });

  test("extracts the cookie when preceded by another cookie", () => {
    expect(readCsrfCookie("session=xyz; csrf_token=tok123; lang=en",),).toBe("tok123",);
  });

  test("extracts the cookie when it is the first pair", () => {
    expect(readCsrfCookie("csrf_token=only; session=xyz",),).toBe("only",);
  });

  test("returns null when the cookie is absent", () => {
    expect(readCsrfCookie("session=xyz",),).toBeNull();
    expect(readCsrfCookie("",),).toBeNull();
    expect(readCsrfCookie(null,),).toBeNull();
  });
});

describe("buildCsrfCookie + resolveCookieSecure", () => {
  test("emits SameSite=Lax + Path=/ + Max-Age + token", () => {
    const cookie = buildCsrfCookie("tok-1", { secure: false, maxAgeSecs: 60, },);
    expect(cookie,).toContain(`${CSRF_COOKIE}=tok-1`,);
    expect(cookie,).toContain("Path=/",);
    expect(cookie,).toContain("Max-Age=60",);
    expect(cookie,).toContain("SameSite=Lax",);
    expect(cookie,).not.toContain("HttpOnly",);
    expect(cookie,).not.toContain("Secure",);
  });

  test("emits Secure when secure=true", () => {
    const cookie = buildCsrfCookie("tok-2", { secure: true, maxAgeSecs: 60, },);
    expect(cookie,).toContain("Secure",);
  });

  test("resolveCookieSecure follows the override matrix", () => {
    expect(resolveCookieSecure(true, false,),).toBe(true,);
    expect(resolveCookieSecure(false, true,),).toBe(false,);
    expect(resolveCookieSecure(undefined, true,),).toBe(true,);
    expect(resolveCookieSecure(undefined, false,),).toBe(false,);
  });
});

describe("decideCsrf — disabled mode", () => {
  const opts = { secret: SECRET, enabled: false, };

  test("passes through any unsafe request when disabled", () => {
    const headers = makeHeaders({ cookie: `${CSRF_COOKIE}=bogus`, },);
    const d = decideCsrf(opts, {
      method: "POST",
      routePattern: "/api/foo",
      headers,
      sessionId: "u",
      requestId: "r-1",
    },);
    expect(d.ok,).toBe(true,);
    expect(d.cookieToIssue,).toBeNull();
  });
});

describe("decideCsrf — safe methods (issuance path)", () => {
  const opts = { secret: SECRET, enabled: true, };

  test("first GET with no cookie mints a token bound to anonymous::<requestId>", () => {
    const headers = makeHeaders({},);
    const d = decideCsrf(opts, {
      method: "GET",
      routePattern: "/api/whoami",
      headers,
      sessionId: null,
      requestId: "req-abc",
    },);
    expect(d.ok,).toBe(true,);
    expect(d.cookieToIssue,).not.toBeNull();
    expect(d.cookieToIssue?.length,).toBeGreaterThan(20,);
  });

  test("first GET with authenticated session mints a token bound to sessionId", () => {
    const headers = makeHeaders({},);
    const d = decideCsrf(opts, {
      method: "GET",
      routePattern: "/api/whoami",
      headers,
      sessionId: "user-42",
      requestId: "req-abc",
    },);
    expect(d.ok,).toBe(true,);
    expect(d.cookieToIssue,).not.toBeNull();
    // Token must verify against the same sessionId
    expect(verifyCsrfToken(SECRET, d.cookieToIssue!, "user-42",),).toBe(true,);
    expect(verifyCsrfToken(SECRET, d.cookieToIssue!, "user-other",),).toBe(false,);
  });

  test("subsequent GET with valid existing cookie is a no-op (no re-issuance)", () => {
    const sessionId = "user-77";
    const existing = mintCsrfToken(SECRET, sessionId, {},);
    const headers = makeHeaders({ cookie: `${CSRF_COOKIE}=${existing}`, },);
    const d = decideCsrf(opts, {
      method: "GET",
      routePattern: "/api/whoami",
      headers,
      sessionId,
      requestId: "req-xyz",
    },);
    expect(d.ok,).toBe(true,);
    expect(d.cookieToIssue,).toBeNull();
  });

  test("GET with stale cookie (wrong binding) re-issues", () => {
    const stale = mintCsrfToken(SECRET, "old-session", {},);
    const headers = makeHeaders({ cookie: `${CSRF_COOKIE}=${stale}`, },);
    const d = decideCsrf(opts, {
      method: "GET",
      routePattern: "/api/whoami",
      headers,
      sessionId: "new-session",
      requestId: "req-xyz",
    },);
    expect(d.ok,).toBe(true,);
    expect(d.cookieToIssue,).not.toBeNull();
    expect(d.cookieToIssue,).not.toBe(stale,);
  });
});

describe("decideCsrf — unsafe methods (verification path)", () => {
  const opts = { secret: SECRET, enabled: true, };

  test("POST with valid header + matching cookie bound to session passes", () => {
    const sessionId = "user-1";
    const token = mintCsrfToken(SECRET, sessionId, {},);
    const headers = makeHeaders({
      [CSRF_HEADER]: token,
      cookie: `${CSRF_COOKIE}=${token}`,
    },);
    const d = decideCsrf(opts, {
      method: "POST",
      routePattern: "/api/chats",
      headers,
      sessionId,
      requestId: "req-1",
    },);
    expect(d.ok,).toBe(true,);
  });

  test("POST with header but no cookie passes (single-submit variant)", () => {
    const sessionId = "user-2";
    const token = mintCsrfToken(SECRET, sessionId, {},);
    const headers = makeHeaders({ [CSRF_HEADER]: token, },);
    const d = decideCsrf(opts, {
      method: "POST",
      routePattern: "/api/chats",
      headers,
      sessionId,
      requestId: "req-2",
    },);
    expect(d.ok,).toBe(true,);
  });

  test("POST with mismatched header and cookie fails", () => {
    const sessionId = "user-3";
    const a = mintCsrfToken(SECRET, sessionId, {},);
    const b = mintCsrfToken(SECRET, sessionId, {},);
    const headers = makeHeaders({
      [CSRF_HEADER]: a,
      cookie: `${CSRF_COOKIE}=${b}`,
    },);
    const d = decideCsrf(opts, {
      method: "POST",
      routePattern: "/api/chats",
      headers,
      sessionId,
      requestId: "req-3",
    },);
    expect(d.ok,).toBe(false,);
  });

  test("POST with token bound to wrong sessionId fails", () => {
    const token = mintCsrfToken(SECRET, "user-other", {},);
    const headers = makeHeaders({ [CSRF_HEADER]: token, },);
    const d = decideCsrf(opts, {
      method: "POST",
      routePattern: "/api/chats",
      headers,
      sessionId: "user-self",
      requestId: "req-4",
    },);
    expect(d.ok,).toBe(false,);
  });

  test("POST with no token at all fails", () => {
    const headers = makeHeaders({},);
    const d = decideCsrf(opts, {
      method: "POST",
      routePattern: "/api/chats",
      headers,
      sessionId: "user-x",
      requestId: "req-5",
    },);
    expect(d.ok,).toBe(false,);
  });

  test("POST with empty header fails", () => {
    const headers = makeHeaders({ [CSRF_HEADER]: "", },);
    const d = decideCsrf(opts, {
      method: "POST",
      routePattern: "/api/chats",
      headers,
      sessionId: "user-x",
      requestId: "req-6",
    },);
    expect(d.ok,).toBe(false,);
  });

  test("unauthenticated POST (no sessionId yet) binds to anonymous::<requestId>", () => {
    const token = mintCsrfToken(SECRET, "anonymous::req-7", {},);
    const headers = makeHeaders({ [CSRF_HEADER]: token, },);
    const d = decideCsrf(opts, {
      method: "POST",
      routePattern: "/api/foo",
      headers,
      sessionId: null,
      requestId: "req-7",
    },);
    expect(d.ok,).toBe(true,);
  });

  test("unauthenticated POST with token from a different requestId fails", () => {
    const token = mintCsrfToken(SECRET, "anonymous::req-attacker", {},);
    const headers = makeHeaders({ [CSRF_HEADER]: token, },);
    const d = decideCsrf(opts, {
      method: "POST",
      routePattern: "/api/foo",
      headers,
      sessionId: null,
      requestId: "req-victim",
    },);
    expect(d.ok,).toBe(false,);
  });
});

describe("decideCsrf — exempt routes (auth POSTs)", () => {
  const opts = { secret: SECRET, enabled: true, };

  test("POST /api/auth/login skips verification (no token required)", () => {
    const headers = makeHeaders({},);
    const d = decideCsrf(opts, {
      method: "POST",
      routePattern: "/api/auth/login",
      headers,
      sessionId: null,
      requestId: "req-login-1",
    },);
    expect(d.ok,).toBe(true,);
    // Exempt routes still ISSUE a token (bound to anonymous::<requestId>)
    // so the response carries a Set-Cookie that the next GET/POST can use.
    expect(d.cookieToIssue,).not.toBeNull();
  });

  test("POST /api/auth/register skips verification", () => {
    const headers = makeHeaders({},);
    const d = decideCsrf(opts, {
      method: "POST",
      routePattern: "/api/auth/register",
      headers,
      sessionId: null,
      requestId: "req-reg-1",
    },);
    expect(d.ok,).toBe(true,);
  });

  test("POST /api/demo-login skips verification", () => {
    const headers = makeHeaders({},);
    const d = decideCsrf(opts, {
      method: "POST",
      routePattern: "/api/demo-login",
      headers,
      sessionId: null,
      requestId: "req-demo-1",
    },);
    expect(d.ok,).toBe(true,);
  });

  test("POST /api/auth/logout is exempt (JWT carries the proof, CSRF cookie may be missing on logout)", () => {
    const headers = makeHeaders({},);
    const d = decideCsrf(opts, {
      method: "POST",
      routePattern: "/api/auth/logout",
      headers,
      sessionId: "user-logout",
      requestId: "req-logout-1",
    },);
    expect(d.ok,).toBe(true,);
  });
});

describe("decideCsrf — method matrix", () => {
  const opts = { secret: SECRET, enabled: true, };

  for (const method of ["PUT", "PATCH", "DELETE",] as const) {
    test(`${method} requires CSRF token`, () => {
      const headers = makeHeaders({},);
      const d = decideCsrf(opts, {
        method,
        routePattern: "/api/resource/1",
        headers,
        sessionId: "user-m",
        requestId: "req-m",
      },);
      expect(d.ok,).toBe(false,);
    });

    test(`${method} passes with valid token`, () => {
      const sessionId = "user-m-pass";
      const token = mintCsrfToken(SECRET, sessionId, {},);
      const headers = makeHeaders({ [CSRF_HEADER]: token, },);
      const d = decideCsrf(opts, {
        method,
        routePattern: "/api/resource/1",
        headers,
        sessionId,
        requestId: "req-m-pass",
      },);
      expect(d.ok,).toBe(true,);
    });
  }
});

describe("cookieForDecision", () => {
  const baseOpts = { secret: SECRET, enabled: true, };

  test("returns null when decision has no cookieToIssue", () => {
    const d = { ok: true, cookieToIssue: null, };
    expect(cookieForDecision(d, baseOpts,),).toBeNull();
  });

  test("emits Secure when override=true", () => {
    const d = { ok: true, cookieToIssue: "tok", };
    const cookie = cookieForDecision(d, { ...baseOpts, cookieSecureOverride: true, },);
    expect(cookie,).toContain("Secure",);
  });

  test("omits Secure when override=false", () => {
    const d = { ok: true, cookieToIssue: "tok", };
    const cookie = cookieForDecision(d, { ...baseOpts, cookieSecureOverride: false, cookieSecureInProd: true, },);
    expect(cookie,).not.toContain("Secure",);
  });

  test("follows cookieSecureInProd default when no override", () => {
    const d = { ok: true, cookieToIssue: "tok", };
    expect(cookieForDecision(d, { ...baseOpts, cookieSecureInProd: true, },),).toContain("Secure",);
    expect(cookieForDecision(d, { ...baseOpts, cookieSecureInProd: false, },),).not.toContain("Secure",);
  });
});

describe("decideCsrf — logger integration", () => {
  test("emits a warn event when verification fails", () => {
    const warns: Array<{ event: string; ctx: unknown }> = [];
    const logger = {
      warn: (event: string, ctx: unknown,) => warns.push({ event, ctx, },),
    } as unknown as { warn: (e: string, c: unknown,) => void };
    const opts = { secret: SECRET, enabled: true, logger: logger as any, };
    const headers = makeHeaders({},);
    decideCsrf(opts, {
      method: "POST",
      routePattern: "/api/foo",
      headers,
      sessionId: "u",
      requestId: "r",
    },);
    expect(warns.length,).toBeGreaterThanOrEqual(1,);
    expect(warns[0]?.event,).toMatch(/csrf\./,);
  });

  test("does not emit warns on safe-method issuance", () => {
    const warns: string[] = [];
    const logger = {
      warn: (event: string,) => warns.push(event,),
    } as unknown as { warn: (e: string,) => void };
    const opts = { secret: SECRET, enabled: true, logger: logger as any, };
    const headers = makeHeaders({},);
    decideCsrf(opts, {
      method: "GET",
      routePattern: "/api/foo",
      headers,
      sessionId: "u",
      requestId: "r",
    },);
    expect(warns,).toEqual([],);
  });
});
