/**
 * Tests for model-comparison routes (Q4 dashboard)
 *
 * Verifies POST create, GET list, GET leaderboard, and validation.
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { MessageRole, } from "../db/enums";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertMessages,
  insertUsers,
} from "../test-utils/insert-helpers";
import { uid, } from "../utils";
import { modelComparisonsRoutes, } from "./model-comparisons";

/**
 * @param db
 * @param userId
 */
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
  let ownerId: string;
  let ownedMessageId: string;

  beforeAll(async () => {
    createLogger({ level: "warn", },);
    ({ db, sqlite, } = await createTestDb());
    // Seed a chat + message owned by `ownerId` so the ownership check passes.
    ownerId = uid();
    await insertUsers(db, "analytics-owner", "Analytics Owner", { id: ownerId, } as never,);
    await insertActors(db, ownerId, {
      id: ownerId,
      actor_type: "user",
      user_id: ownerId,
      owner_id: ownerId,
      agent_type: "none",
      settings: "{}",
      format_version: 0,
    } as never,);
    await insertChats(db, "Analytics Owner Chat", ownerId, {},);
    const chatRow = await db.selectFrom("chats",).select("id",).where("created_by", "=", ownerId,).executeTakeFirst();
    const chatId = chatRow!.id;
    await insertChatParticipants(db, chatId, ownerId, {},);
    await insertMessages(db, chatId, ownerId, MessageRole.User, "owned analytics message", {},);
    const msgRow = await db.selectFrom("messages",).select("id",).where("chat_id", "=", chatId,).executeTakeFirst();
    ownedMessageId = msgRow!.id;
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
    const app = createApp(db, ownerId,);
    const res = await app.handle(
      new Request("http://localhost/api/analytics/comparisons", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          messageId: ownedMessageId,
          referenceModel: "gpt-4",
          preference: "better",
          confidence: 0.85,
        },),
      },),
    );
    expect(res.status,).toBe(201,);
    const body = (await res.json()) as Record<string, unknown>;
    expect(typeof body.id,).toBe("string",);
    expect(body.message_id,).toBe(ownedMessageId,);
    expect(body.reference_model,).toBe("gpt-4",);
    expect(body.preference,).toBe("better",);
    expect(body.confidence,).toBeCloseTo(0.85,);
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

  test("rejects a messageId not owned by the authenticated user", async () => {
    const app = createApp(db, uid(),);
    const res = await app.handle(
      new Request("http://localhost/api/analytics/comparisons", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          messageId: "someone-elses-message",
          referenceModel: "gpt-4",
          preference: "better",
          confidence: 0.8,
        },),
      },),
    );
    expect(res.status,).toBe(400,);
  });
});

describe("GET /api/analytics/comparisons", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  let seededUserId: string;
  beforeAll(async () => {
    createLogger({ level: "warn", },);
    ({ db, sqlite, } = await createTestDb());
    // Seed test data
    const userId = uid();
    seededUserId = userId;
    for (let i = 0; i < 3; i++) {
      await db.insertInto("model_comparisons",).values({
        id: uid(),
        message_id: `msg-list-${i}`,
        user_id: userId,
        reference_model: "gpt-4",
        preference: i === 0 ? "better" : (i === 1 ? "worse" : "same"),
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

  test("returns only the authenticated user's comparisons", async () => {
    const app = createApp(db, seededUserId,);
    const res = await app.handle(
      new Request("http://localhost/api/analytics/comparisons",),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { comparisons: Array<{ user_id: string }> };
    expect(body.comparisons.length,).toBeGreaterThanOrEqual(3,);
    for (const c of body.comparisons) {
      expect(c.user_id,).toBe(seededUserId,);
    }
  });

  test("does not leak another user's comparisons", async () => {
    const app = createApp(db, uid(),);
    const res = await app.handle(
      new Request("http://localhost/api/analytics/comparisons",),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { comparisons: unknown[] };
    expect(body.comparisons.length,).toBe(0,);
  });
});

describe("GET /api/analytics/comparisons/leaderboard", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  let userId: string;
  beforeAll(async () => {
    createLogger({ level: "warn", },);
    ({ db, sqlite, } = await createTestDb());
    // Seed leaderboard test data
    userId = uid();
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
    // Foreign user's row — must NOT appear in this user's leaderboard.
    await db.insertInto("model_comparisons",).values({
      id: uid(),
      message_id: "msg-lb-foreign",
      user_id: uid(),
      reference_model: "gpt-4",
      preference: "better",
      confidence: 1.0,
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
    const app = createApp(db, userId,);
    const res = await app.handle(
      new Request("http://localhost/api/analytics/comparisons/leaderboard",),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as {
      leaderboard: {
        reference_model: string;
        totalComparisons: number;
        betterCount: number;
        worseCount: number;
        sameCount: number;
        avgConfidence: number;
      }[];
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
