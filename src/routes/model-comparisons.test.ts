/**
 * Tests for model-comparison routes (Q4 dashboard)
 *
 * Verifies POST create, GET list, GET leaderboard, and validation.
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { uid, } from "../utils";
import { modelComparisonsRoutes, } from "./model-comparisons";

function createApp(db: Kysely<DB>, userId: string | null,): Elysia {
  return new Elysia({ name: "test-model-comparisons", },)
    .derive(() => ({ userId, }))
    .use(modelComparisonsRoutes({ database: db, },),) as unknown as Elysia;
}

describe("modelComparisonsRoutes", () => {
  test("exports function", () => {
    expect(typeof modelComparisonsRoutes,).toBe("function",);
  });

  test("returns Elysia plugin", () => {
    const mockDb = {} as Kysely<DB>;
    const plugin = modelComparisonsRoutes({ database: mockDb, },);
    expect(plugin,).toBeDefined();
  });
});

describe("POST /api/analytics/comparisons", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    createLogger({ level: "warn", },);
    ({ db, sqlite, } = await createTestDb());
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  test("returns 401 without userId", async () => {
    const app = createApp(db, null,);
    const res = await app.handle(
      new Request("http://localhost/api/analytics/comparisons", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          messageId: "msg-1",
          referenceModel: "gpt-4",
          preference: "better",
          confidence: 0.8,
        },),
      },),
    );
    expect(res.status,).toBe(401,);
  });

  test("returns 201 with created comparison", async () => {
    const app = createApp(db, uid(),);
    const res = await app.handle(
      new Request("http://localhost/api/analytics/comparisons", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          messageId: "msg-test-1",
          referenceModel: "gpt-4",
          preference: "better",
          confidence: 0.85,
        },),
      },),
    );
    expect(res.status,).toBe(201,);
    const body = (await res.json()) as Record<string, unknown>;
    expect(typeof body.id,).toBe("string",);
    expect(body.message_id,).toBe("msg-test-1",);
    expect(body.reference_model,).toBe("gpt-4",);
    expect(body.preference,).toBe("better",);
    expect(body.confidence,).toBe(0.85,);
    expect(typeof body.created_at,).toBe("string",);
  });

  test("rejects invalid preference", async () => {
    const app = createApp(db, uid(),);
    const res = await app.handle(
      new Request("http://localhost/api/analytics/comparisons", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          messageId: "msg-2",
          referenceModel: "gpt-4",
          preference: "invalid",
          confidence: 0.5,
        },),
      },),
    );
    expect(res.status,).toBe(400,);
  });

  test("rejects confidence out of range", async () => {
    const app = createApp(db, uid(),);
    const res = await app.handle(
      new Request("http://localhost/api/analytics/comparisons", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          messageId: "msg-3",
          referenceModel: "gpt-4",
          preference: "better",
          confidence: 1.5,
        },),
      },),
    );
    expect(res.status,).toBe(400,);
  });

  test("rejects missing fields", async () => {
    const app = createApp(db, uid(),);
    const res = await app.handle(
      new Request("http://localhost/api/analytics/comparisons", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ messageId: "msg-4", },),
      },),
    );
    expect(res.status,).toBe(400,);
  });
});

describe("GET /api/analytics/comparisons", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    createLogger({ level: "warn", },);
    ({ db, sqlite, } = await createTestDb());
    // Seed test data
    const userId = uid();
    for (let i = 0; i < 3; i++) {
      await db.insertInto("model_comparisons",).values({
        id: uid(),
        message_id: `msg-list-${i}`,
        user_id: userId,
        reference_model: "gpt-4",
        preference: i === 0 ? "better" : i === 1 ? "worse" : "same",
        confidence: 0.5 + i * 0.1,
        created_at: new Date(Date.now() + i * 1000,).toISOString(),
      },).execute();
    }
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  test("returns 401 without userId", async () => {
    const app = createApp(db, null,);
    const res = await app.handle(
      new Request("http://localhost/api/analytics/comparisons",),
    );
    expect(res.status,).toBe(401,);
  });

  test("returns comparisons list", async () => {
    const app = createApp(db, uid(),);
    const res = await app.handle(
      new Request("http://localhost/api/analytics/comparisons",),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { comparisons: unknown[] };
    expect(Array.isArray(body.comparisons,),).toBe(true,);
    expect(body.comparisons.length,).toBeGreaterThanOrEqual(3,);
  });
});

describe("GET /api/analytics/comparisons/leaderboard", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    createLogger({ level: "warn", },);
    ({ db, sqlite, } = await createTestDb());
    // Seed leaderboard test data
    const userId = uid();
    await db.insertInto("model_comparisons",).values({
      id: uid(),
      message_id: "msg-lb-1",
      user_id: userId,
      reference_model: "claude-3",
      preference: "better",
      confidence: 0.9,
      created_at: new Date().toISOString(),
    },).execute();
    await db.insertInto("model_comparisons",).values({
      id: uid(),
      message_id: "msg-lb-2",
      user_id: userId,
      reference_model: "claude-3",
      preference: "better",
      confidence: 0.7,
      created_at: new Date().toISOString(),
    },).execute();
    await db.insertInto("model_comparisons",).values({
      id: uid(),
      message_id: "msg-lb-3",
      user_id: userId,
      reference_model: "gpt-4",
      preference: "worse",
      confidence: 0.6,
      created_at: new Date().toISOString(),
    },).execute();
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  test("returns 401 without userId", async () => {
    const app = createApp(db, null,);
    const res = await app.handle(
      new Request("http://localhost/api/analytics/comparisons/leaderboard",),
    );
    expect(res.status,).toBe(401,);
  });

  test("returns aggregated stats by model", async () => {
    const app = createApp(db, uid(),);
    const res = await app.handle(
      new Request("http://localhost/api/analytics/comparisons/leaderboard",),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as {
      leaderboard: Array<{
        reference_model: string;
        totalComparisons: number;
        betterCount: number;
        worseCount: number;
        sameCount: number;
        avgConfidence: number;
      }>;
    };
    expect(Array.isArray(body.leaderboard,),).toBe(true,);
    expect(body.leaderboard.length,).toBeGreaterThanOrEqual(2,);

    const claude = body.leaderboard.find((r,) => r.reference_model === "claude-3");
    expect(claude,).toBeDefined();
    expect(claude!.totalComparisons,).toBe(2,);
    expect(claude!.betterCount,).toBe(2,);

    const gpt4 = body.leaderboard.find((r,) => r.reference_model === "gpt-4");
    expect(gpt4,).toBeDefined();
    expect(gpt4!.totalComparisons,).toBe(1,);
    expect(gpt4!.worseCount,).toBe(1,);
  });
});
