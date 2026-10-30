// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for GET /api/analytics/quality (FEAT-062).
 *
 * The endpoint reads the assistant message row: token counts, latency and
 * tokens/second from the dedicated columns, the repetition rate and finish
 * reason from the `metadata.quality` JSON blob. The fixture therefore seeds
 * messages the way the write paths do - including SQLite datetime text, which
 * is what the `created_at` column default stores.
 *
 * Resource contract (parallel-safe): every database here is an in-memory
 * SQLite handle created by `createTestDb()`, so no two tests - in this file or
 * in a sibling file - ever share a database, a file path or a port. The
 * process-global `setTestDatabase()` override is never touched, so a failed
 * assertion cannot leak a handle into another file. The negative-space block
 * below owns a SEPARATE database and gives each of its tests a DISTINCT user,
 * so no test can observe another test's rows and the block passes in any
 * order.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { MessageRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChats,
  insertMessages,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { analyticsRoutes, } from "./index";
import { qualityHandler, } from "./quality";
import type { AnalyticsCtx, } from "./types";

/** Quality blob as the write path stores it under `messages.metadata`. */
function qualityBlob(repetitionRate: number, finishReason: string,): string {
  return `{"quality":{"repetitionRate":${repetitionRate},"finishReason":"${finishReason}"}}`;
}

/**
 * @param db
 * @param userId
 */
function createApp(db: Kysely<DB>, userId: string | null,): Elysia {
  return new Elysia({ name: "test-analytics-quality", },)
    .derive(() => ({ userId, }))
    .use(analyticsRoutes({ database: db, },),) as unknown as Elysia;
}

/** Shape of the quality endpoint's JSON body. */
interface QualityBody {
  totals: {
    generations: number;
    withQualityMetrics: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    avgLatencyMs: number;
    avgTokensPerSecond: number;
    avgRepetitionRate: number;
  };
  byModel: {
    model: string | null;
    provider: string | null;
    generations: number;
    totalTokens: number;
    avgRepetitionRate: number;
  }[];
  trend: { date: string; generations: number; totalTokens: number; avgRepetitionRate: number }[];
  finishReasons: { reason: string; count: number }[];
}

/**
 * Issue a quality report request against a specific database as a specific
 * user. Takes the database explicitly so every caller owns its own handle.
 * @param db - the database the request must read from
 * @param query - the query string, without the leading `?` for an empty one
 * @param user - the calling user, or null for an unauthenticated request
 * @returns the HTTP status and the parsed body
 */
async function requestQuality(
  db: Kysely<DB>,
  query: string,
  user: string | null,
): Promise<{ status: number; body: QualityBody }> {
  const app = createApp(db, user,);
  const res = await app.handle(new Request(`http://localhost/api/analytics/quality${query}`,),);
  return { status: res.status, body: (await res.json()) as QualityBody, };
}

describe("GET /api/analytics/quality", () => {
  let db: Kysely<DB>;
  const userId = "quality-user";
  const otherUserId = "quality-other-user";
  const chatOne = "quality-chat-1";
  const chatTwo = "quality-chat-2";
  const foreignChat = "quality-chat-foreign";

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    await insertUsers(db, userId, "Quality User", { id: userId, } as never,);
    await insertUsers(db, otherUserId, "Quality Other", { id: otherUserId, } as never,);
    await insertActors(db, "Quality User", { id: userId, actor_type: "user" as never, user_id: userId, },);
    await insertActors(db, "Quality Other", {
      id: otherUserId,
      actor_type: "user" as never,
      user_id: otherUserId,
    },);

    await insertChats(db, "Quality chat 1", userId, { id: chatOne, },);
    await insertChats(db, "Quality chat 2", userId, { id: chatTwo, },);
    await insertChats(db, "Foreign chat", otherUserId, { id: foreignChat, },);

    // Day 1, two models.
    await insertMessages(db, chatOne, userId, MessageRole.Assistant, "first reply", {
      model_id: "model-a",
      provider: "openai",
      token_count_prompt: 100,
      token_count_completion: 50,
      token_count_total: 150,
      generation_time_ms: 1000,
      tokens_per_second: 50,
      metadata: qualityBlob(0.5, "stop",),
      created_at: "2026-01-01 10:00:00",
    },);

    await insertMessages(db, chatTwo, userId, MessageRole.Assistant, "second reply", {
      model_id: "model-b",
      provider: "openai",
      token_count_prompt: 200,
      token_count_completion: 100,
      token_count_total: 300,
      generation_time_ms: 3000,
      tokens_per_second: 30,
      metadata: qualityBlob(0.25, "length",),
      created_at: "2026-01-01 12:00:00",
    },);

    // Day 2, model-a again.
    await insertMessages(db, chatOne, userId, MessageRole.Assistant, "third reply", {
      model_id: "model-a",
      provider: "openai",
      token_count_prompt: 50,
      token_count_completion: 25,
      token_count_total: 75,
      generation_time_ms: 500,
      tokens_per_second: 50,
      metadata: qualityBlob(0.75, "stop",),
      created_at: "2026-01-02 10:00:00",
    },);

    // Another user's chat: must never reach the caller's report.
    await insertMessages(db, foreignChat, otherUserId, MessageRole.Assistant, "foreign reply", {
      model_id: "model-a",
      provider: "openai",
      token_count_prompt: 9999,
      token_count_completion: 9999,
      token_count_total: 19998,
      generation_time_ms: 9999,
      tokens_per_second: 1,
      metadata: qualityBlob(0.9, "stop",),
      created_at: "2026-01-01 10:00:00",
    },);

    // A user turn carries a quality blob but is not a generation.
    await insertMessages(db, chatOne, userId, MessageRole.User, "a user turn", {
      model_id: "model-a",
      provider: "openai",
      token_count_total: 4242,
      generation_time_ms: 4242,
      metadata: qualityBlob(0.99, "stop",),
      created_at: "2026-01-01 11:00:00",
    },);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  async function get(query: string, user: string | null = userId,): Promise<{ status: number; body: QualityBody }> {
    return requestQuality(db, query, user,);
  }

  test("returns 401 without a userId", async () => {
    const { status, } = await get("", null,);
    expect(status,).toBe(401,);
  });

  test("qualityHandler returns 200 totals directly", async () => {
    const ctx = { userId, query: {}, } as unknown as AnalyticsCtx;
    const res = await qualityHandler(db, ctx,);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as QualityBody;
    expect(body.totals.generations,).toBe(3,);
    expect(body.totals.totalTokens,).toBe(525,);
  });

  test("aggregates totals over the caller's own generations", async () => {
    const { status, body, } = await get("",);
    expect(status,).toBe(200,);
    expect(body.totals.generations,).toBe(3,);
    expect(body.totals.withQualityMetrics,).toBe(3,);
    expect(body.totals.promptTokens,).toBe(350,);
    expect(body.totals.completionTokens,).toBe(175,);
    expect(body.totals.totalTokens,).toBe(525,);
    expect(body.totals.avgLatencyMs,).toBe(1500,);
    expect(body.totals.avgTokensPerSecond,).toBe(43.33,);
    expect(body.totals.avgRepetitionRate,).toBe(0.5,);
  });

  test("groups by model, sorted by generations descending", async () => {
    const { body, } = await get("",);
    expect(body.byModel.length,).toBe(2,);
    expect(body.byModel[0]?.model,).toBe("model-a",);
    expect(body.byModel[0]?.provider,).toBe("openai",);
    expect(body.byModel[0]?.generations,).toBe(2,);
    expect(body.byModel[0]?.totalTokens,).toBe(225,);
    expect(body.byModel[0]?.avgRepetitionRate,).toBe(0.625,);
    expect(body.byModel[1]?.model,).toBe("model-b",);
    expect(body.byModel[1]?.generations,).toBe(1,);
    expect(body.byModel[1]?.totalTokens,).toBe(300,);
  });

  test("returns one trend point per day, ascending", async () => {
    const { body, } = await get("",);
    expect(body.trend.length,).toBe(2,);
    expect(body.trend[0]?.date,).toBe("2026-01-01",);
    expect(body.trend[0]?.generations,).toBe(2,);
    expect(body.trend[0]?.totalTokens,).toBe(450,);
    expect(body.trend[0]?.avgRepetitionRate,).toBe(0.375,);
    expect(body.trend[1]?.date,).toBe("2026-01-02",);
    expect(body.trend[1]?.generations,).toBe(1,);
    expect(body.trend[1]?.totalTokens,).toBe(75,);
  });

  test("counts finish reasons", async () => {
    const { body, } = await get("",);
    expect(body.finishReasons,).toEqual([
      { reason: "stop", count: 2, },
      { reason: "length", count: 1, },
    ],);
  });

  test("the model filter narrows the report", async () => {
    const { body, } = await get("?model=model-a",);
    expect(body.totals.generations,).toBe(2,);
    expect(body.totals.totalTokens,).toBe(225,);
    expect(body.byModel.length,).toBe(1,);
    expect(body.byModel[0]?.model,).toBe("model-a",);
  });

  test("the chatId filter narrows the report", async () => {
    const { body, } = await get(`?chatId=${chatTwo}`,);
    expect(body.totals.generations,).toBe(1,);
    expect(body.totals.totalTokens,).toBe(300,);
    expect(body.byModel[0]?.model,).toBe("model-b",);
  });

  test("the model, chat and date filters combine", async () => {
    const { status, body, } = await get(`?model=model-a&chatId=${chatOne}&from=2026-01-02&to=2026-01-03`,);
    expect(status,).toBe(200,);
    expect(body.totals.generations,).toBe(1,);
    expect(body.totals.totalTokens,).toBe(75,);
    expect(body.byModel.length,).toBe(1,);
    expect(body.byModel[0]?.model,).toBe("model-a",);
    expect(body.trend.length,).toBe(1,);
    expect(body.trend[0]?.date,).toBe("2026-01-02",);
    expect(body.finishReasons,).toEqual([{ reason: "stop", count: 1, },],);
  });

  test("filters that exclude every row return zeroed totals", async () => {
    // model-b only ever occurs in chatTwo, so narrowing to chatOne excludes it.
    const { status, body, } = await get(`?model=model-b&chatId=${chatOne}`,);
    expect(status,).toBe(200,);
    expect(body.totals.generations,).toBe(0,);
    expect(body.totals.totalTokens,).toBe(0,);
    expect(body.byModel,).toEqual([],);
    expect(body.trend,).toEqual([],);
    expect(body.finishReasons,).toEqual([],);
  });

  test("the from filter keeps the from-day and drops earlier days", async () => {
    const { body, } = await get("?from=2026-01-02",);
    expect(body.totals.generations,).toBe(1,);
    expect(body.totals.totalTokens,).toBe(75,);
    expect(body.trend.length,).toBe(1,);
    expect(body.trend[0]?.date,).toBe("2026-01-02",);
  });

  test("the to filter is exclusive of the to-day", async () => {
    const { body, } = await get("?to=2026-01-02",);
    expect(body.totals.generations,).toBe(2,);
    expect(body.totals.totalTokens,).toBe(450,);
    expect(body.trend.length,).toBe(1,);
    expect(body.trend[0]?.date,).toBe("2026-01-01",);
  });

  test("returns 404 for a chat owned by another user", async () => {
    const { status, } = await get(`?chatId=${foreignChat}`,);
    expect(status,).toBe(404,);
  });

  test("returns 404 for an unknown chat", async () => {
    const { status, } = await get("?chatId=does-not-exist",);
    expect(status,).toBe(404,);
  });

  test("a model filter matching nothing returns zeroed totals", async () => {
    const { status, body, } = await get("?model=no-such-model",);
    expect(status,).toBe(200,);
    expect(body.totals.generations,).toBe(0,);
    expect(body.totals.totalTokens,).toBe(0,);
    expect(body.totals.avgLatencyMs,).toBe(0,);
    expect(body.totals.avgRepetitionRate,).toBe(0,);
    expect(body.byModel,).toEqual([],);
    expect(body.trend,).toEqual([],);
    expect(body.finishReasons,).toEqual([],);
  });

  test("a date range excluding every row returns zeroed totals", async () => {
    const { status, body, } = await get("?from=2026-03-01&to=2026-04-01",);
    expect(status,).toBe(200,);
    expect(body.totals.generations,).toBe(0,);
    expect(body.totals.totalTokens,).toBe(0,);
    expect(body.totals.avgLatencyMs,).toBe(0,);
    expect(body.totals.avgRepetitionRate,).toBe(0,);
    expect(body.byModel,).toEqual([],);
    expect(body.trend,).toEqual([],);
  });
});

// ── Negative space ───────────────────────────────────────────────
// The endpoint guards every json_extract with json_valid() and silently
// ignores an unparsable date filter (the parseExpiryMs convention of
// chats.ts). These tests pin that behaviour.
//
// Resource contract: each test below owns its OWN in-memory database,
// created in beforeEach and destroyed in afterEach, so no test can observe
// another test's rows and a failed assertion cannot leave a handle behind.
// The process-global setTestDatabase() override is never touched.
describe("GET /api/analytics/quality - negative space", () => {
  let fixture: TestDb | undefined;

  beforeEach(async () => {
    fixture = await createTestDb();
  },);

  afterEach(async () => {
    // Undefined when the setup itself failed - there is nothing to release.
    if (fixture !== undefined) {
      await destroyTestDb(fixture,);
      fixture = undefined;
    }
  },);

  /** The current test's own database. */
  function db(): Kysely<DB> {
    if (fixture === undefined) { throw new Error("test fixture not created",); }
    return fixture.db;
  }

  /** @param userId */
  async function seedUser(userId: string,): Promise<void> {
    await insertUsers(db(), userId, `Neg ${userId}`, { id: userId, } as never,);
    await insertActors(db(), `Neg ${userId}`, {
      id: userId,
      actor_type: "user" as never,
      user_id: userId,
    },);
  }

  /**
   * Seed a chat with one well-formed generation.
   * @param userId - the owning user
   * @param chatId - the chat to create
   * @param createdAt - the SQLite datetime text of the generation
   */
  async function seedGeneration(userId: string, chatId: string, createdAt: string,): Promise<void> {
    await insertChats(db(), `Neg chat ${chatId}`, userId, { id: chatId, },);
    await insertMessages(db(), chatId, userId, MessageRole.Assistant, "baseline reply", {
      model_id: "model-a",
      provider: "openai",
      token_count_prompt: 100,
      token_count_completion: 50,
      token_count_total: 150,
      generation_time_ms: 1000,
      tokens_per_second: 50,
      metadata: qualityBlob(0.5, "stop",),
      created_at: createdAt,
    },);
  }

  test("a row with malformed metadata JSON is ignored, not fatal", async () => {
    // Without the json_valid() guard, json_extract() on "{bad" throws and
    // the whole report would fail instead of skipping the row.
    const userId = "neg-malformed-user";
    const goodChat = "neg-malformed-good";
    const badChat = "neg-malformed-bad";

    await seedUser(userId,);
    await seedGeneration(userId, goodChat, "2026-01-01 10:00:00",);
    await seedGeneration(userId, badChat, "2026-01-01 10:00:00",);
    await insertMessages(db(), badChat, userId, MessageRole.Assistant, "malformed reply", {
      model_id: "model-a",
      provider: "openai",
      token_count_prompt: 999,
      token_count_completion: 999,
      token_count_total: 1998,
      generation_time_ms: 9999,
      tokens_per_second: 1,
      metadata: "{bad",
      created_at: "2026-01-01 11:00:00",
    },);

    const bad = await requestQuality(db(), `?chatId=${badChat}`, userId,);
    expect(bad.status,).toBe(200,);

    const good = await requestQuality(db(), `?chatId=${goodChat}`, userId,);
    expect(bad.body.totals,).toEqual(good.body.totals,);
    expect(bad.body.totals.generations,).toBe(1,);
    expect(bad.body.totals.totalTokens,).toBe(150,);
  });

  test("a row without a quality blob counts neither as a generation nor in the averages", async () => {
    const userId = "neg-no-quality-user";
    const goodChat = "neg-no-quality-good";
    const bareChat = "neg-no-quality-bare";

    await seedUser(userId,);
    await seedGeneration(userId, goodChat, "2026-01-01 10:00:00",);
    await seedGeneration(userId, bareChat, "2026-01-01 10:00:00",);
    await insertMessages(db(), bareChat, userId, MessageRole.Assistant, "no quality reply", {
      model_id: "model-a",
      provider: "openai",
      token_count_prompt: 888,
      token_count_completion: 888,
      token_count_total: 1776,
      generation_time_ms: 8888,
      tokens_per_second: 2,
      metadata: '{"note":"x"}',
      created_at: "2026-01-01 12:00:00",
    },);

    const bare = await requestQuality(db(), `?chatId=${bareChat}`, userId,);
    expect(bare.status,).toBe(200,);

    const good = await requestQuality(db(), `?chatId=${goodChat}`, userId,);
    expect(bare.body.totals,).toEqual(good.body.totals,);
    expect(bare.body.totals.generations,).toBe(1,);
    expect(bare.body.totals.withQualityMetrics,).toBe(1,);
    expect(bare.body.totals.totalTokens,).toBe(150,);
    expect(bare.body.totals.avgLatencyMs,).toBe(1000,);
    expect(bare.body.totals.avgRepetitionRate,).toBe(0.5,);
  });

  test("an unparsable date filter is ignored and the report stays unfiltered", async () => {
    const userId = "neg-date-user";

    await seedUser(userId,);
    await seedGeneration(userId, "neg-date-chat-1", "2026-01-01 10:00:00",);
    await seedGeneration(userId, "neg-date-chat-2", "2026-01-02 10:00:00",);

    const unfiltered = await requestQuality(db(), "", userId,);
    const garbage = await requestQuality(db(), "?from=garbage", userId,);
    expect(garbage.status,).toBe(200,);
    expect(garbage.body.totals,).toEqual(unfiltered.body.totals,);
    expect(garbage.body.totals.generations,).toBe(2,);

    // Positive control: a parsable date filter still narrows the report, so
    // the garbage case is a silent skip, not a broken filter.
    const filtered = await requestQuality(db(), "?from=2026-01-02", userId,);
    expect(filtered.body.totals.generations,).toBe(1,);
  });
});
