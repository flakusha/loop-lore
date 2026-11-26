// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
/**
 * Route tests for POST/GET /api/v1/harness/reports: the admin guard, the
 * store's 400 contract (unknown source/category, attempt > max_attempts,
 * negative duration_ms, over-long detail), the dedupe upsert through the
 * API, instance scoping (cross-instance rows invisible), the POST rate
 * limit, and the GET limit cap.
 *
 * Parallel-safe resource contract: per-test in-memory DB (beforeEach /
 * finally-teardown afterEach), per-test instance slug + dedupe keys via
 * randomUUID (injected `instanceSlug` seam — never process.env), per-test
 * mkdtemp spool dir, per-test rate limiter.
 */
import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, } from "node:fs";
import { join, } from "node:path";
import type { DB, } from "../../db/schema";
import { insertToolingReport, REPORT_DETAIL_MAX_CHARS, } from "../../harness/reports";
import { REPORTS_SPOOL_FILENAME, resetReportSpoolPath, setReportSpoolPath, } from "../../harness/reports-spool";
import { createRateLimiter, } from "../../middleware/rate-limit";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { reportRoutes, } from "./reports";

/** Shared PARENT for per-test spool fixtures (repo .tmp/, never system temp). */
const TMP_ROOT = ".tmp/harness-reports-routes";

let db: Kysely<DB>;
let dbFixture: TestDb | null = null;
let spoolDir: string | null = null;
let instance = "";
/** Shared limiter for the rate-limit test (null → plugin default per mount). */
let sharedLimiter: ReturnType<typeof createRateLimiter> | null = null;

/** Mount the routes on a fresh app with a fixed role and THIS test's seams. */
function app(role: string | null, maxRequests = 30,): Elysia {
  const built = new Elysia({},)
    .derive(() => ({ userId: "u1", userRole: role, }))
    .use(
      reportRoutes(
        {
          database: db,
          instanceSlug: () => instance,
          // One limiter shared across requests within a test: a per-mount
          // limiter would reset the budget on every fresh app() below.
          reportRateLimiter: sharedLimiter ?? createRateLimiter({ windowMs: 60_000, maxRequests, },),
        },
      ),
    );

  return built as unknown as Elysia;
}

/** POST one report payload. */
function post(role: string | null, body: unknown, maxRequests = 30,): Promise<Response> {
  return app(role, maxRequests,).handle(
    new Request("http://localhost/api/v1/harness/reports", {
      method: "POST",
      headers: { "content-type": "application/json", },
      body: JSON.stringify(body,),
    },),
  );
}

/** GET the list endpoint. */
function list(role: string | null, query = "",): Promise<Response> {
  return app(role,).handle(new Request(`http://localhost/api/v1/harness/reports${query}`,),);
}

/** A valid report body with per-test unique values. */
function body(overrides: Record<string, unknown> = {},): Record<string, unknown> {
  return {
    source: "check",
    category: "tooling_failure",
    tool: `tool-${crypto.randomUUID().slice(0, 8,)}`,
    detail: "gate failed",
    ...overrides,
  };
}

beforeEach(async () => {
  mkdirSync(TMP_ROOT, { recursive: true, },);
  dbFixture = await createTestDb();
  db = dbFixture.db;
  instance = `inst-${crypto.randomUUID()}`;
  spoolDir = mkdtempSync(join(TMP_ROOT, "spool-",),);
  setReportSpoolPath(join(spoolDir, REPORTS_SPOOL_FILENAME,),);
},);

afterEach(() => {
  try {
    if (spoolDir !== null) { rmSync(spoolDir, { recursive: true, force: true, },); }
  } finally {
    spoolDir = null;
    sharedLimiter = null;
    resetReportSpoolPath();
    const fixture = dbFixture;
    dbFixture = null;
    if (fixture !== null) {
      return destroyTestDb(fixture,);
    }
  }
},);

describe("auth", () => {
  it("denies a non-admin POST and GET with 403", async () => {
    const viewerPost = await post("viewer", body(),);
    const viewerList = await list("viewer",);
    const anonList = await list(null,);
    expect(viewerPost.status,).toBe(403,);
    expect(viewerList.status,).toBe(403,);
    expect(anonList.status,).toBe(403,);
  });

  it("allows an admin POST and GET", async () => {
    const adminPost = await post("admin", body(),);
    const adminList = await list("admin",);
    expect(adminPost.status,).toBe(200,);
    expect(adminList.status,).toBe(200,);
  });
});

describe("POST validation (the store's 400 contract)", () => {
  it("answers 400 for an unknown source", async () => {
    const res = await post("admin", body({ source: "agent", },),);
    expect(res.status,).toBe(400,);
  });

  it("answers 400 for an unknown category", async () => {
    const res = await post("admin", body({ category: "crash", },),);
    expect(res.status,).toBe(400,);
  });

  it("answers 400 when attempt exceeds max_attempts", async () => {
    const res = await post("admin", body({ attempt: 4, max_attempts: 3, },),);
    expect(res.status,).toBe(400,);
  });

  it("answers 400 for a negative duration_ms", async () => {
    const res = await post("admin", body({ duration_ms: -5, },),);
    expect(res.status,).toBe(400,);
  });

  it("answers 400 for an over-long detail", async () => {
    const res = await post("admin", body({ detail: "x".repeat(REPORT_DETAIL_MAX_CHARS + 1,), },),);
    expect(res.status,).toBe(400,);
  });

  it("answers 422 (app-wide shape envelope) for a non-integer attempt", async () => {
    const res = await post("admin", body({ attempt: "second", },),);
    expect(res.status,).toBe(422,);
  });
});

describe("POST ingest", () => {
  it("stores a report and echoes the row; a repeat key dedupes", async () => {
    const key = `k-${crypto.randomUUID()}`;
    const first = await post("admin", body({ dedupe_key: key, },),);
    expect(first.status,).toBe(200,);
    const firstBody = await first.json() as {
      deduped: boolean;
      report: { count: number; instance_id: string; dedupe_key: string };
    };

    expect(firstBody.deduped,).toBe(false,);
    expect(firstBody.report.count,).toBe(1,);
    expect(firstBody.report.instance_id,).toBe(instance,);

    const second = await post("admin", body({ dedupe_key: key, },),);
    const secondBody = await second.json() as { deduped: boolean; report: { count: number } };
    expect(secondBody.deduped,).toBe(true,);
    expect(secondBody.report.count,).toBe(2,);
  });

  it("mirrors the stored row to the spool (snake_case)", async () => {
    const key = `k-${crypto.randomUUID()}`;
    await post("admin", body({ dedupe_key: key, },),);
    const raw = readFileSync(join(spoolDir!, REPORTS_SPOOL_FILENAME,), "utf8",);
    const line = JSON.parse(raw.trim().split("\n",)[0]!,) as Record<string, unknown>;
    expect(line["instance_id"],).toBe(instance,);
    expect(line["dedupe_key"],).toBe(key,);
  });

  it("rate limits POST per client IP with 429", async () => {
    sharedLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: 1, },);
    const firstHit = await post("admin", body(),);
    const secondHit = await post("admin", body(),);
    expect(firstHit.status,).toBe(200,);
    expect(secondHit.status,).toBe(429,);
  });
});

/** GET the list endpoint's `total` for one query string. */
async function totalFor(query: string,): Promise<number> {
  const res = await list("admin", query,);
  const page = await res.json() as { total: number };
  return page.total;
}

describe("GET listing", () => {
  it("is instance-scoped: rows stamped for another instance are invisible", async () => {
    await post("admin", body(),);
    await insertToolingReport(db, {
      source: "giwt",
      category: "persistent_failure",
      tool: "foreign",
      detail: "another instance's row",
      instanceId: `inst-${crypto.randomUUID()}`,
    },);

    const res = await list("admin",);
    const page = await res.json() as { items: { instance_id: string }[]; total: number };
    expect(page.total,).toBe(1,);
    expect(page.items[0]!["instance_id"],).toBe(instance,);
  });

  it("filters by source, category, tool and dedupe_key", async () => {
    const key = `k-${crypto.randomUUID()}`;
    await post("admin", body({ source: "giwt", category: "performance", dedupe_key: key, },),);
    const b = await body();
    await post("admin", b,);

    expect(await totalFor("?source=giwt",),).toBe(1,);
    expect(await totalFor(`?tool=${encodeURIComponent(String(b["tool"],),)}`,),).toBe(1,);
    expect(await totalFor(`?dedupe_key=${encodeURIComponent(key,)}`,),).toBe(1,);
  });

  it("caps ?limit at 200 and pages with offset", async () => {
    for (let i = 0; i < 205; i++) {
      await insertToolingReport(db, {
        source: "check",
        category: "performance",
        tool: "bulk",
        detail: `row ${i}`,
        instanceId: instance,
        ts: `2026-11-19T00:00:${String(Math.floor(i / 60,),).padStart(2, "0",)}:${
          String(i % 60,).padStart(2, "0",)
        }.000Z`,
      },);
    }

    const cappedRes = await list("admin", "?limit=99999",);
    const capped = await cappedRes.json() as { items: unknown[]; total: number };
    expect(capped.total,).toBe(205,);
    expect(capped.items.length,).toBe(200,);
    const pagedRes = await list("admin", "?limit=10&offset=200",);
    const paged = await pagedRes.json() as { items: unknown[] };
    expect(paged.items.length,).toBe(5,);
    const garbageRes = await list("admin", "?limit=abc",);
    const garbage = await garbageRes.json() as { items: unknown[] };
    expect(garbage.items.length,).toBe(50,);
  });
});
