// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Governance guard + endpoint tests: per-user route-policy limiting and
 * the /rate-limit/status + /metrics endpoints.
 */
import { afterEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import { governanceRateLimiter, } from "../../api-governance/rate-limiting/instance";
import { governanceEndpoints, governanceGuard, } from "./governance";

function makeApp(userId: string | undefined, userRole: string | null = "user",) {
  return new Elysia({ name: "gov-test", },)
    .derive(() => ({ userId, userRole, }))
    .use(governanceGuard(),)
    .get("/api/v1/auth/ping", () => Response.json({ ok: true, },),)
    .get("/api/v1/anything", () => Response.json({ ok: true, },),)
    .use(governanceEndpoints(),);
}

afterEach(() => {
  governanceRateLimiter.destroy();
},);

describe("governanceGuard rate limiting", () => {
  test("blocks the 11th auth-policy request per user", async () => {
    const app = makeApp("user-gov-1",);
    let last = 0;
    for (let i = 0; i < 11; i++) {
      const res = await app.handle(new Request("http://localhost/api/v1/auth/ping",),);
      last = res.status;
    }
    expect(last,).toBe(429,);
  });

  test("policies are namespaced: default policy unaffected by auth-path spend", async () => {
    const app = makeApp("user-gov-2",);
    for (let i = 0; i < 10; i++) {
      await app.handle(new Request("http://localhost/api/v1/auth/ping",),);
    }
    const res = await app.handle(new Request("http://localhost/api/v1/anything",),);
    expect(res.status,).toBe(200,);
  });

  test("unauthenticated requests bypass the guard", async () => {
    const app = makeApp(undefined,);
    for (let i = 0; i < 12; i++) {
      const res = await app.handle(new Request("http://localhost/api/v1/auth/ping",),);
      expect(res.status,).toBe(200,);
    }
  });
});

describe("governanceEndpoints", () => {
  test("rate-limit/status reports policy + remaining without consuming", async () => {
    const app = makeApp("user-gov-3",);
    await app.handle(new Request("http://localhost/api/v1/auth/ping",),);
    const res = await app.handle(
      new Request("http://localhost/api/v1/rate-limit/status?path=/api/v1/auth/login",),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as { policy: string; limit: number; remaining: number };
    expect(body.policy,).toBe("auth",);
    expect(body.limit,).toBe(10,);
    expect(body.remaining,).toBe(9,);
  });

  test("metrics requires admin", async () => {
    const app = makeApp("user-gov-4", "user",);
    const denied = await app.handle(new Request("http://localhost/api/v1/metrics",),);
    expect(denied.status,).toBe(403,);

    const admin = makeApp("admin-gov-4", "admin",);
    const ok = await admin.handle(new Request("http://localhost/api/v1/metrics",),);
    expect(ok.status,).toBe(200,);
    expect(ok.headers.get("content-type",),).toContain("text/plain",);
    const body = await ok.text();
    expect(body,).toContain("loop_lore_uptime_seconds",);
  });
});
