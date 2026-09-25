/**
 * Tests for FEAT-060 comparison export route.
 * Verifies JSON and markdown export formats for an A/B run record.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { uid, } from "../utils";
import { comparisonsExportRoutes, } from "./comparisons-export";

function createApp(db: Kysely<DB>, userId: string | null,): Elysia {
  return new Elysia({ name: "test-comparisons-export", },)
    .derive(() => ({ userId, }))
    .use(comparisonsExportRoutes({ database: db, },),) as unknown as Elysia;
}

describe("comparisonsExportRoutes", () => {
  let db: Kysely<DB>;
  let sqlite: import("bun:sqlite").Database;
  let userId: string;
  let runId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, sqlite, } = await createTestDb());
    userId = uid();
    runId = uid();
    const results = JSON.stringify([
      {
        model: { provider: "p1", name: "m1", },
        response: "first response",
        latencyMs: 120,
        tokenCount: 30,
        cost: 0.01,
        status: "success",
        metadata: { kind: "ab", },
      },
      {
        model: { provider: "p2", name: "m2", },
        response: "second response",
        latencyMs: 240,
        tokenCount: 30,
        cost: 0.01,
        status: "success",
        metadata: { kind: "ab", },
      },
    ],);
    const ratings = JSON.stringify({
      "m1": { rating: 5, notes: "clearer", },
      "m2": { rating: 3, notes: "verbose", },
    },);
    const metadata = JSON.stringify({ sweep: false, modelCount: 2, },);
    await db
      .insertInto("model_comparison_runs",)
      .values({
        id: runId,
        user_id: userId,
        prompt: "compare these models",
        results,
        ratings,
        metadata,
        created_at: "2026-01-15T10:00:00.000Z",
      },)
      .execute();
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  test("returns 401 without userId", async () => {
    const app = createApp(db, null,);
    const res = await app.handle(
      new Request(`http://localhost/api/v1/comparisons/${runId}/export`,),
    );
    expect(res.status,).toBe(401,);
  });

  test("returns 404 for unknown comparison id", async () => {
    const app = createApp(db, userId,);
    const res = await app.handle(
      new Request(`http://localhost/api/v1/comparisons/${uid()}/export`,),
    );
    expect(res.status,).toBe(404,);
  });

  test("returns 404 for another user's comparison", async () => {
    const app = createApp(db, uid(),);
    const res = await app.handle(
      new Request(`http://localhost/api/v1/comparisons/${runId}/export`,),
    );
    expect(res.status,).toBe(404,);
  });

  test("exports JSON by default with results, ratings, and metadata", async () => {
    const app = createApp(db, userId,);
    const res = await app.handle(
      new Request(`http://localhost/api/v1/comparisons/${runId}/export`,),
    );
    expect(res.status,).toBe(200,);
    expect(res.headers.get("content-type",),).toContain("application/json",);
    const body = (await res.json()) as {
      id: string;
      prompt: string;
      results: Array<{ model: { provider: string; name: string }; response: string; latencyMs: number }>;
      ratings: Record<string, { rating: number; notes: string }>;
      metadata: Record<string, unknown>;
      createdAt: string;
    };
    expect(body.id,).toBe(runId,);
    expect(body.prompt,).toBe("compare these models",);
    expect(body.results.length,).toBe(2,);
    expect(body.results[0]!.response,).toBe("first response",);
    expect(body.results[0]!.latencyMs,).toBe(120,);
    expect(body.ratings["m1"]!.rating,).toBe(5,);
    expect(body.metadata,).toMatchObject({ sweep: false, modelCount: 2, },);
    expect(body.createdAt,).toBe("2026-01-15T10:00:00.000Z",);
  });

  test("exports markdown when format=markdown with sections per model", async () => {
    const app = createApp(db, userId,);
    const res = await app.handle(
      new Request(`http://localhost/api/v1/comparisons/${runId}/export?format=markdown`,),
    );
    expect(res.status,).toBe(200,);
    expect(res.headers.get("content-type",),).toContain("text/markdown",);
    expect(res.headers.get("content-disposition",),).toContain("attachment",);
    const md = await res.text();
    expect(md,).toContain("# Model comparison",);
    expect(md,).toContain("compare these models",);
    expect(md,).toContain("### p1 / m1",);
    expect(md,).toContain("first response",);
    expect(md,).toContain("### p2 / m2",);
    expect(md,).toContain("second response",);
    expect(md,).toContain("120 ms",);
    expect(md,).toContain("240 ms",);
    expect(md,).toContain("5",);
    expect(md,).toContain("clearer",);
  });
});
