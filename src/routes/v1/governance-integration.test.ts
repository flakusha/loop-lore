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
import { MessageRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertMessages,
} from "../../test-utils/insert-helpers";
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
    // POST /api/v1/auth/logout is the still-protected auth-budget probe:
    // GET /api/v1/auth/me was reclassified to chatPolicy
    // (BUG-e2e-browser-authme-429), so hammering it can no longer trip the
    // 10/min auth budget this test is about.
    const logout = (): Request => new Request("http://localhost/api/v1/auth/logout", { method: "POST", },);
    for (let i = 0; i < 11; i++) {
      const res = await app.handle(logout(),);
      statuses.push(res.status,);
    }

    // The endpoint itself is healthy: a broken mount that 429s or 500s on the
    // very first call would make the rest of this test vacuous.
    expect(statuses[0],).toBe(200,);
    // The barrel throttles — impossible without the guard mounted on it.
    expect(statuses.at(-1,),).toBe(429,);
  });

  test("the auth/me identity probe is NOT on the auth budget (BUG-e2e-browser-authme-429)", async () => {
    const app = createV1App(db, userId,);
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) {
      const res = await app.handle(new Request("http://localhost/api/v1/auth/me",),);
      statuses.push(res.status,);
    }

    // 11 per-page probes in a burst: chatPolicy (300/min, burst 50) absorbs
    // them all. Under the old classification (authPolicy: 10/min, burst 5)
    // the tail of this loop 429'd.
    expect(statuses.every((st,) => st === 200),).toBe(true,);
  });

  test("a different policy prefix is not throttled by the auth policy (policyForRoute ran per-prefix)", async () => {
    const app = createV1App(db, userId,);
    const logout = (): Request => new Request("http://localhost/api/v1/auth/logout", { method: "POST", },);
    for (let i = 0; i < 11; i++) {
      await app.handle(logout(),);
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
    const logout = (): Request => new Request("http://localhost/api/v1/auth/logout", { method: "POST", },);
    for (let i = 0; i < 11; i++) {
      const res = await app.handle(logout(),);
      if (res.status === 429) { throttled += 1; }
    }

    expect(throttled,).toBeGreaterThan(0,);
    const res = await app.handle(new Request("http://localhost/api/v1/metrics",),);
    expect(res.status,).toBe(200,);
    const body = await res.text();
    // Every request through the barrel is recorded exactly once (200s by the
    // guard's onAfterHandle, 429s by its onBeforeHandle branch), and the
    // rate_limited counter matches the 429s actually served.
    expect(body,).toContain(`loop_lore_route_requests_total{route="/api/v1/auth/logout"} 11`,);
    expect(body,).toContain(`loop_lore_rate_limited_total ${throttled}`,);
  });

  test("the 429 carries the guard's own x-ratelimit-hit marker (not a route-level 429)", async () => {
    const app = createV1App(db, userId,);
    let throttled: Response | undefined;
    const logout = (): Request => new Request("http://localhost/api/v1/auth/logout", { method: "POST", },);
    for (let i = 0; i < 11; i++) {
      throttled = await app.handle(logout(),);
    }

    // Only governance.ts sets this header; a 429 from any other layer (route
    // handler, error boundary) would not carry it.
    expect(throttled?.status,).toBe(429,);
    expect(throttled?.headers.get("x-ratelimit-hit",),).toBe("1",);
    expect(throttled?.headers.get("ratelimit-remaining",),).toBe("0",);
  });

  test("ai-action is throttled by the generation policy through the real barrel (S-5)", async () => {
    // Seed a real chat + message so the route HANDLER answers (503 — no aux
    // model configured in this bare config): the first response proves the
    // request reaches the mounted surface, so any later 429 is the guard.
    const app = createV1App(db, userId,);
    await insertActors(db, "Gov Actor", {
      id: userId,
      actor_type: "user",
      user_id: userId,
      owner_id: userId,
      agent_type: "none",
      settings: "{}",
      row_version: 0,
    } as never,);

    await insertChats(db, "Gov Ai Action Chat", userId, {},);
    const chatId =
      (await db.selectFrom("chats",).select("id",).where("name", "=", "Gov Ai Action Chat",).executeTakeFirst())!.id;

    await insertChatParticipants(db, chatId, userId, {},);
    const messageId = uid();
    await insertMessages(db, chatId, userId, MessageRole.User, "governance probe", { id: messageId, },);

    const post = (): Request =>
      new Request(`http://localhost/api/v1/chats/${chatId}/messages/${messageId}/ai-action`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ action: "summarize", },),
      },);

    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) {
      statuses.push((await app.handle(post(),)).status,);
    }

    expect(statuses[0],).toBe(503,);
    // generationPolicy: 20/min with burst 5 — a fast loop drains the burst
    // bucket after 5 requests and the 6th is refused. Under the pre-fix
    // classification (chatPolicy: 300/min, burst 50) none of these 8 would
    // ever 429, so the boundary is the discriminating assertion.
    expect(statuses.slice(5,).every((s,) => s === 429),).toBe(true,);
  });

  test("link-preview is throttled by the outbound-fetch policy through the real barrel (S-12)", async () => {
    const app = createV1App(db, userId,);
    await insertChats(db, "Gov Link Preview Chat", userId, {},);
    const chatId =
      (await db.selectFrom("chats",).select("id",).where("name", "=", "Gov Link Preview Chat",).executeTakeFirst())!.id;

    await insertChatParticipants(db, chatId, userId, {},);

    // The loopback URL is rejected by the service's SSRF guard — 400 with no
    // network I/O, deterministic, and proof the route (not a fall-through)
    // answered. outboundFetchPolicy allows 30/min with burst 10, so request
    // 11 is the first refusal; under the pre-fix chatPolicy (burst 50) it
    // would have been another 400.
    const get = (): Request =>
      new Request(`http://localhost/api/v1/chats/${chatId}/link-preview?url=http%3A%2F%2F127.0.0.1%2Fx`,);

    const statuses: number[] = [];
    let last: Response | undefined;
    for (let i = 0; i < 12; i++) {
      last = await app.handle(get(),);
      statuses.push(last.status,);
    }

    expect(statuses[0],).toBe(400,);
    expect(statuses.slice(10,).every((s,) => s === 429),).toBe(true,);
    expect(last?.headers.get("x-ratelimit-hit",),).toBe("1",);
  });
});
