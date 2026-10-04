// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * v1 governance guard INTEGRATION test (BUG-nothing-tests-that-api-v1-actually-mounts-the-governance-gua).
 *
 * `governance.test.ts` builds a bare `new Elysia()` and calls `governanceGuard()`
 * directly, so it proves the guard works in isolation but is blind to the
 * integration seam: whether `v1Routes` (index.ts:57) mounts it at all, whether
 * `policyForRoute` picks the right policy per prefix through the real route
 * tree, and whether the onAfterHandle → `/metrics` path survives composition.
 *
 * Every assertion here goes through the REAL barrel, so deleting that `.use()`
 * line fails this file.
 *
 * Resource contract (parallel-safe):
 *  - DB: its OWN `:memory:` SQLite from createTestDb, released by an afterAll
 *    that is guarded against a failed beforeAll (no fixed path, no port).
 *  - env: OWNS NOTHING in `process.env`. The guard's enable predicate is
 *    INJECTED (`governanceEnabled`), so this file cannot enable or disable
 *    governance for a sibling file sharing the process.
 *  - process-global singletons: `metrics` and `governanceRateLimiter` are
 *    SHARED MODULE STATE, not owned. They are reset in beforeEach/afterEach
 *    around every test so no counter or rate-limit window survives into the
 *    next file; under `--parallel` each file additionally has its own module
 *    registry. They cannot be un-shared, so this file must not be run in a
 *    runner that interleaves two files' TESTS within one module registry.
 *  - driven via app.handle() (never Bun.serve), no cron, no ordering dependence.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { governanceRateLimiter, } from "../../api-governance/rate-limiting/instance";
import { metrics, } from "../../api-governance/telemetry/collector";
import type { AsyncStore, } from "../../async/store";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { uid, } from "../../utils";
import { v1Routes, } from "./index";

/** Test seam — matches the AsyncStore surface consumed by route plugins. */
function stubAsyncStore(): AsyncStore {
  return {
    track() {},
    progress() {},
    complete() {},
    fail() {},
    config: { maxInlineBytes: 65536, defaultTtlMs: 24 * 60 * 60 * 1000, queueLimit: 10_000, },
    async flush() {},
    async read() {
      return null;
    },

    destroy() {},
  };
}

/**
 * Mount the REAL v1 barrel — `index.ts:57`'s `governanceGuard` included — behind
 * a derived auth context, same shape as the sibling barrel tests.
 * @param db
 * @param userId Seeded admin; the `/metrics` exposition is admin-gated.
 */
function createV1App(db: Kysely<DB>, userId: string | null,): Elysia {
  const t = (k: string,) => k;
  return new Elysia({ name: "test-v1-governance", },)
    .derive(() => ({ userId, userRole: userId ? "admin" : null, sessionId: null, locale: "en", t, }))
    // Injected predicate, NOT a process.env mutation: the guard must be live for
    // this file without E2E_SAFEGUARD being cleared process-wide.
    .use(
      v1Routes({ database: db, config: {} as never, asyncStore: stubAsyncStore(), governanceEnabled: () => true, },),
    ) as unknown as Elysia;
}

describe("v1 governance guard is mounted by the real route tree", () => {
  let db: Kysely<DB>;
  const userId = uid();
  // No process.env mutation: the guard's enable predicate is INJECTED via
  // `governanceEnabled` (see createV1App), so this file never reads or writes
  // E2E_SAFEGUARD and cannot change governance behaviour for a sibling file
  // sharing the process.
  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    await db.insertInto("users",).values({
      id: userId,
      username: `user-${userId}`,
      display_name: "Governance Integration",
      role: "admin",
      status: "active",
      settings: "{}",
    },).execute();
  },);

  afterAll(async () => {
    // Guarded: a failed beforeAll leaves `db` undefined, and an unguarded
    // destroy() throws a TypeError that bun reports as an EXTRA spurious
    // failure alongside the real setup error. Exit status is unchanged; this
    // removes the noise, it does not hide anything.
    if (!db) { return; }
    await db.destroy();
  },);

  // Both governance singletons are process-wide; reset between tests so the
  // counts below are ours alone and no window survives into the next file.
  beforeEach(() => {
    metrics.reset();
  },);

  afterEach(() => {
    governanceRateLimiter.destroy();
  },);

  test("crossing the auth policy limit through v1Routes answers 429 (index.ts:57 guard is live)", async () => {
    const app = createV1App(db, userId,);
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await app.handle(new Request("http://localhost/api/v1/auth/me",),);
      statuses.push(res.status,);
    }

    // The endpoint itself is healthy: a broken mount that 429s or 500s on the
    // very first call would make the rest of this test vacuous.
    expect(statuses[0],).toBe(200,);
    // The barrel throttles — impossible without the guard mounted on it.
    expect(statuses.at(-1,),).toBe(429,);
  });

  test("a different policy prefix is not throttled by the auth policy (policyForRoute ran per-prefix)", async () => {
    const app = createV1App(db, userId,);
    for (let i = 0; i < 11; i++) {
      await app.handle(new Request("http://localhost/api/v1/auth/me",),);
    }

    // /api/v1/auth/* → authPolicy (max 10); /api/v1/health → defaultPolicy
    // (max 300). A guard mounted with the wrong policy — or one global bucket
    // per user regardless of prefix — would 429 this too.
    const health = await app.handle(new Request("http://localhost/api/v1/health",),);
    expect(health.status,).toBe(200,);
  });

  test("the throttled request reaches the real /metrics Prometheus surface (onAfterHandle → collector)", async () => {
    const app = createV1App(db, userId,);
    let throttled = 0;
    for (let i = 0; i < 11; i++) {
      const res = await app.handle(new Request("http://localhost/api/v1/auth/me",),);
      if (res.status === 429) { throttled += 1; }
    }

    expect(throttled,).toBeGreaterThan(0,);
    const res = await app.handle(new Request("http://localhost/api/v1/metrics",),);
    expect(res.status,).toBe(200,);
    const body = await res.text();
    // Every request through the barrel is recorded exactly once (200s by the
    // guard's onAfterHandle, 429s by its onBeforeHandle branch), and the
    // rate_limited counter matches the 429s actually served.
    expect(body,).toContain(`loop_lore_route_requests_total{route="/api/v1/auth/me"} 11`,);
    expect(body,).toContain(`loop_lore_rate_limited_total ${throttled}`,);
  });

  test("the 429 carries the guard's own x-ratelimit-hit marker (not a route-level 429)", async () => {
    const app = createV1App(db, userId,);
    let throttled: Response | undefined;
    for (let i = 0; i < 11; i++) {
      throttled = await app.handle(new Request("http://localhost/api/v1/auth/me",),);
    }

    // Only governance.ts sets this header; a 429 from any other layer (route
    // handler, error boundary) would not carry it.
    expect(throttled?.status,).toBe(429,);
    expect(throttled?.headers.get("x-ratelimit-hit",),).toBe("1",);
    expect(throttled?.headers.get("ratelimit-remaining",),).toBe("0",);
  });
});
