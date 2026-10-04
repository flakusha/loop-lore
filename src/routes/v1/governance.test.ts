// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Governance guard + endpoint tests: per-user route-policy limiting and
 * the /rate-limit/status + /metrics endpoints.
 *
 * Resource contract (parallel-safe):
 *  - db/file/port: NONE. Every app is an in-process `new Elysia()` driven by
 *    `app.handle()`; no Bun.serve, no fixed path, no fixture on disk.
 *  - process-global singletons: `governanceRateLimiter` and `metrics` are
 *    SHARED MODULE STATE, not owned by this file. The file-level `afterEach`
 *    destroys the limiter after EVERY test, and the one test that reads
 *    `metrics.snapshot()` resets it first, so no rate-limit window or counter
 *    survives into the next file. Do NOT move either reset into `beforeAll`:
 *    `governance-integration.test.ts` resets the same two singletons and both
 *    files must stay correct when they share one module registry (verified
 *    under `bun test --parallel=1 --no-isolate`, both file orders, 12 pass).
 *  - rate-limit keys are per-test user strings ("user-gov-N", "admin-gov-4"),
 *    so two tests can never bill the same bucket.
 *  - no ordering dependence: no test reads state another test wrote.
 */
import { afterEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import { governanceRateLimiter, } from "../../api-governance/rate-limiting/instance";
import { metrics, } from "../../api-governance/telemetry/collector";
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

  test("throttled request carries standard RateLimit headers (BUG-governance-429-responses-missing-ratelimit-retry-after-heade)", async () => {
    const app = makeApp("user-gov-headers",);
    let throttled: Response | undefined;
    for (let i = 0; i < 11; i++) {
      throttled = await app.handle(new Request("http://localhost/api/v1/auth/ping",),);
    }

    expect(throttled?.status,).toBe(429,);
    const limit = throttled?.headers.get("ratelimit-limit",);
    const remaining = throttled?.headers.get("ratelimit-remaining",);
    const reset = throttled?.headers.get("ratelimit-reset",);
    const retryAfter = throttled?.headers.get("retry-after",);
    expect(limit,).toBe("10",);
    expect(remaining,).toBe("0",);
    expect(Number(reset,),).toBeGreaterThan(0,);
    expect(Number(retryAfter,),).toBeGreaterThan(0,);
    expect(Number(retryAfter,),).toBeLessThanOrEqual(60,);
  });

  test("throttled request produces exactly one telemetry increment (BUG-governance-429s-double-counted-in-telemetry)", async () => {
    metrics.reset();
    const app = makeApp("user-gov-telemetry",);
    let throttled = 0;
    let ok = 0;
    for (let i = 0; i < 11; i++) {
      const res = await app.handle(new Request("http://localhost/api/v1/auth/ping",),);
      if (res.status === 429) { throttled += 1; }
      else { ok += 1; }
    }

    expect(throttled,).toBeGreaterThan(0,);
    const snapshot = metrics.snapshot();
    // Each 429 recorded exactly once — not twice (before + after handle).
    expect(snapshot.counters["rate_limited_total"],).toBe(throttled,);
    const route = snapshot.routes.find((r,) => r.route === "/api/v1/auth/ping");
    expect(route?.requests,).toBe(ok + throttled,);
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

  test("hostile ?path= value degrades to the request path, never a 500", async () => {
    const app = makeApp("user-gov-5",);
    const res = await app.handle(
      new Request("http://localhost/api/v1/rate-limit/status?path=://",),
    );

    expect(res.status,).toBe(200,);
    const body = await res.json() as { policy: string };
    // Falls back to /api/v1/rate-limit/status → default policy.
    expect(body.policy,).toBe("default",);
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
