/**
 * Tests for analytics routes.
 *
 * Tests the conversation analytics endpoints:
 *   GET /api/analytics/chats/:chatId  — Per-chat stats
 *   GET /api/analytics/overview       — Aggregate stats
 *   GET /api/analytics/characters     — Per-character comparison
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { MessageRole, } from "../db/enums";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { hashId, record, } from "../telemetry/service";
import { createTestDb, } from "../test-utils/create-test-db";
import {
  insertActors,
  insertChats,
  insertMessages,
  insertUsers,
} from "../test-utils/insert-helpers";
import { analyticsRoutes, } from "./analytics";

/**
 * @param db
 * @param userId
 */
function createApp(db: Kysely<DB>, userId: string | null,): Elysia {
  return new Elysia({ name: "test-analytics", },)
    .derive(() => ({ userId, }))
    .use(analyticsRoutes({ database: db, },),) as unknown as Elysia;
}

describe("analyticsRoutes", () => {
  let db: Kysely<DB>;
  const userId = "test-user-1";
  const chatId = "test-chat-1";

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    await insertUsers(db, userId, "Analytics User", { id: userId, } as never,);
    await db.insertInto("chats",).values({
      id: chatId,
      created_by: userId,
      name: "Analytics chat",
      created_at: new Date().toISOString(),
    },).execute();
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  // ── Auth ─────────────────────────────────────────────────────

  test("GET /api/analytics/chats/:chatId returns 401 without userId", async () => {
    const app = createApp(db, null,);
    const res = await app.handle(new Request(`http://localhost/api/analytics/chats/${chatId}`,),);
    expect(res.status,).toBe(401,);
  });

  test("GET /api/analytics/overview returns 401 without userId", async () => {
    const app = createApp(db, null,);
    const res = await app.handle(new Request("http://localhost/api/analytics/overview",),);
    expect(res.status,).toBe(401,);
  });

  // ── Empty state ──────────────────────────────────────────────

  test("GET /api/analytics/chats/:chatId returns 404 when the user cannot access the chat", async () => {
    const app = createApp(db, "other-user",);
    const res = await app.handle(new Request(`http://localhost/api/analytics/chats/${chatId}`,),);
    expect(res.status,).toBe(404,);
  });

  test("GET /api/analytics/overview returns zeros when no events", async () => {
    const app = createApp(db, userId,);
    const res = await app.handle(new Request("http://localhost/api/analytics/overview",),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as Record<string, number>;
    expect(body.totalGenerations,).toBe(0,);
    expect(body.totalTokens,).toBe(0,);
    expect(body.avgLatencyMs,).toBe(0,);
    expect(body.costEstimate,).toBe(0,);
    expect(body.failedGenerations,).toBe(0,);
  });

  // ── With data ────────────────────────────────────────────────

  test("GET /api/analytics/chats/:chatId returns correct stats", async () => {
    // Written through `record()` — the only path production uses, and the one
    // that hashes IDs — so raw-ID filters would read 0 here
    // (BUG-analytics-per-user-routes-filter-telemetry-events-by-raw-ids).
    await record(db, {
      eventType: "generation.completed",
      chatId,
      userId,
      data: { promptTokens: 100, completionTokens: 50, totalTokens: 150, latencyMs: 1000, model: "test-model", },
    },);

    await record(db, {
      eventType: "generation.completed",
      chatId,
      userId,
      data: { promptTokens: 200, completionTokens: 100, totalTokens: 300, latencyMs: 2000, model: "test-model", },
    },);

    const app = createApp(db, userId,);
    const res = await app.handle(new Request(`http://localhost/api/analytics/chats/${chatId}`,),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as Record<string, number>;
    expect(body.totalGenerations,).toBe(2,);
    expect(body.totalTokens,).toBe(450,);
    expect(body.avgLatencyMs,).toBe(1500,);
    expect(body.costEstimate,).toBeGreaterThanOrEqual(0,);
  });

  test("GET /api/analytics/overview returns aggregates", async () => {
    // A failed generation through the real write path (hashed IDs), for a
    // different chat — proves the overview filter matches what `record()` writes.
    await record(db, {
      eventType: "generation.failed",
      chatId: "other-chat",
      userId,
      data: { reason: "timeout", },
    },);

    const app = createApp(db, userId,);
    const res = await app.handle(new Request("http://localhost/api/analytics/overview",),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as Record<string, number>;
    expect(body.totalGenerations,).toBeGreaterThanOrEqual(2,);
    expect(body.totalTokens,).toBeGreaterThanOrEqual(450,);
    expect(body.failedGenerations,).toBeGreaterThanOrEqual(1,);
  });

  // ── Response format ──────────────────────────────────────────

  test("response Content-Type is application/json", async () => {
    const app = createApp(db, userId,);
    const res = await app.handle(new Request("http://localhost/api/analytics/overview",),);
    expect(res.headers.get("content-type",),).toStartWith("application/json",);
  });

  // ── Date range filter (FEAT-059) ─────────────────────────────────

  test("GET /api/analytics/chats/:chatId?from&to narrows by created_at", async () => {
    // Insert a fresh in-window event, plus an old out-of-window event.
    const inWindowAt = Date.now();
    const outOfWindowAt = Date.now() - 7 * 86_400_000;
    const otherChatId = "date-range-chat";
    await insertChats(db, "Date range chat", userId, { id: otherChatId, },);
    await db
      .insertInto("telemetry_events",)
      .values([
        {
          id: crypto.randomUUID(),
          event_type: "generation.completed",
          chat_id: hashId(otherChatId,),
          user_id: hashId(userId,),
          event_data: JSON.stringify({ totalTokens: 100, latencyMs: 500, },),
          source: "server",
          created_at: new Date(inWindowAt,).toISOString(),
        },
        {
          id: crypto.randomUUID(),
          event_type: "generation.completed",
          chat_id: hashId(otherChatId,),
          user_id: hashId(userId,),
          event_data: JSON.stringify({ totalTokens: 999, latencyMs: 9999, },),
          source: "server",
          created_at: new Date(outOfWindowAt,).toISOString(),
        },
      ],)
      .execute();

    const app = createApp(db, userId,);
    const fromIso = new Date(inWindowAt - 60_000,).toISOString();
    const toIso = new Date(inWindowAt + 60_000,).toISOString();
    const url = `http://localhost/api/analytics/chats/${otherChatId}?from=${encodeURIComponent(fromIso,)}&to=${
      encodeURIComponent(toIso,)
    }`;

    const res = await app.handle(new Request(url,),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { totalGenerations: number; totalTokens: number; from: string; to: string };
    expect(body.totalGenerations,).toBe(1,);
    expect(body.totalTokens,).toBe(100,);
    expect(body.from,).toBe(fromIso,);
    expect(body.to,).toBe(toIso,);
  });

  test("GET /api/analytics/chats/:chatId?from=garbage ignores unparseable from", async () => {
    const app = createApp(db, userId,);
    const url = `http://localhost/api/analytics/chats/${chatId}?from=not-a-date`;
    const res = await app.handle(new Request(url,),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { totalGenerations: number };
    // The seeded earlier tests inserted at least one row for chatId; just
    // assert the query did not 500 on bad input.
    expect(typeof body.totalGenerations,).toBe("number",);
  });

  // ── Character comparison (FEAT-059 AC5) ──────────────────────

  const charId = "char-a";
  const otherCharId = "char-other";
  const charChatId = "char-chat-1";
  const otherOwnerChatId = "other-owner-chat";

  test("GET /api/analytics/characters returns 401 without userId", async () => {
    const app = createApp(db, null,);
    const res = await app.handle(new Request("http://localhost/api/analytics/characters",),);
    expect(res.status,).toBe(401,);
  });

  test("GET /api/analytics/characters rolls up owned characters and isolates other owners", async () => {
    await insertUsers(db, "other-user", "Other User", { id: "other-user", } as never,);
    // Characters ARE actors — the rollup joins `actors` (actor_type
    // 'character'), because the `characters` side table is never inserted in
    // production.
    await insertActors(db, "User One", { id: userId, actor_type: "user" as never, user_id: userId, },);
    await insertActors(db, "Char A", { id: charId, actor_type: "character" as never, owner_id: userId, },);
    await insertActors(db, "Other Char", {
      id: otherCharId,
      actor_type: "character" as never,
      owner_id: "other-user",
    },);

    // Tie on totalTokens with Char A to pin the deterministic tie-break
    // (tokens desc, then id asc).
    const charBId = "test-char-2";
    await insertActors(db, "Char B", { id: charBId, actor_type: "character" as never, owner_id: userId, },);
    await insertChats(db, "Char chat", userId, { id: charChatId, },);
    await insertChats(db, "Other owner chat", "other-user", { id: otherOwnerChatId, },);
    // Two assistant turns from the caller's character, plus one user turn in
    // the same chat (counts toward role tokens, not the character table).
    await insertMessages(db, charChatId, charId, MessageRole.Assistant, "hello there", { token_count_total: 100, },);
    await insertMessages(db, charChatId, charId, MessageRole.Assistant, "longer reply text", {
      token_count_total: 300,
    },);

    await insertMessages(db, charChatId, userId, MessageRole.User, "hi", { token_count_total: 50, },);
    // Char B matches Char A's 400 tokens so the tie-break is observable.
    await insertMessages(db, charChatId, charBId, MessageRole.Assistant, "tie one", { token_count_total: 250, },);
    await insertMessages(db, charChatId, charBId, MessageRole.Assistant, "tie two", { token_count_total: 150, },);
    // Caller's character used inside another owner's chat — the chat-ownership
    // filter must exclude it (regression guard for cross-owner leakage).
    await insertMessages(db, otherOwnerChatId, charId, MessageRole.Assistant, "cross owner", {
      token_count_total: 777,
    },);

    // Another owner's character in their own chat — excluded by both filters.
    await insertMessages(db, otherOwnerChatId, otherCharId, MessageRole.Assistant, "secret", {
      token_count_total: 9999,
    },);

    const app = createApp(db, userId,);
    const res = await app.handle(new Request("http://localhost/api/analytics/characters",),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as {
      characters: {
        id: string;
        name: string;
        totalMessages: number;
        totalTokens: number;
        avgResponseLength: number;
        tokensPerMessage: number;
      }[];
    };

    const charA = body.characters.find((c,) => c.id === charId);
    expect(charA,).toBeDefined();
    expect(charA?.totalMessages,).toBe(2,);
    expect(charA?.totalTokens,).toBe(400,);
    expect(charA?.avgResponseLength,).toBe(14,);
    expect(charA?.tokensPerMessage,).toBe(200,);
    expect(charA?.name,).toBe("Char A",);
    expect(body.characters.some((c,) => c.id === otherCharId),).toBe(false,);
    // Deterministic order: 400/400 tie broken by id ascending.
    expect(body.characters.map((c,) => c.id),).toEqual([charId, charBId,],);
  });

  test("GET /api/analytics/overview exposes tokensByRole", async () => {
    const app = createApp(db, userId,);
    const res = await app.handle(new Request("http://localhost/api/analytics/overview",),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as {
      tokensByRole: { user: number; assistant: number; system: number };
    };

    // The character test seeded a 50-token user turn and 400 assistant tokens
    // in the caller's chat, so the role split is non-zero.
    expect(body.tokensByRole.user,).toBeGreaterThanOrEqual(50,);
    expect(body.tokensByRole.assistant,).toBeGreaterThanOrEqual(400,);
    expect(body.tokensByRole.system,).toBe(0,);
  });

  test("GET /api/analytics/overview buckets each generation by latency boundary", async () => {
    // Isolated user so the bucket counts are exact and independent of the
    // other tests' seeds. 499/500/1000/2000/5000 pin every boundary.
    const bucketUser = "bucket-user";
    await db
      .insertInto("telemetry_events",)
      .values(
        [499, 500, 1000, 2000, 5000,].map((latencyMs,) => ({
          id: crypto.randomUUID(),
          event_type: "generation.completed",
          chat_id: null,
          user_id: hashId(bucketUser,),
          event_data: JSON.stringify({ totalTokens: 10, latencyMs, },),
          source: "server",
          created_at: new Date().toISOString(),
        })),
      )
      .execute();

    const app = createApp(db, bucketUser,);
    const res = await app.handle(new Request("http://localhost/api/analytics/overview",),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { latencyBuckets: { label: string; count: number }[] };
    expect(body.latencyBuckets,).toEqual([
      { label: "<500ms", count: 1, },
      { label: "500-1000ms", count: 1, },
      { label: "1000-2000ms", count: 1, },
      { label: "2000-5000ms", count: 1, },
      { label: ">5000ms", count: 1, },
    ],);
  });
});
