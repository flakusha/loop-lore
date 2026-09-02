// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for maybeAutoReply — specifically the swipe_index race fix
 * (.plan/tickets/BUG-chat-swipe-index-race.md).
 *
 * Concurrent `maybeAutoReply` calls against the same parent message must
 * produce distinct `swipe_index` values. Before the unique index
 * `idx_messages_swipe_unique` and the retry-on-conflict insert in
 * reply.ts, two concurrent replies could read the same MAX(swipe_index)
 * and race on INSERT, producing duplicate or lost swipes.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import { MessageRole, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertChats, insertMessages, insertUsers, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import type { AsyncStore, } from "../../async/store";
import { maybeAutoReply, } from "./reply";

/**
 * Minimal Config that takes the synchronous rule-based assistant path
 * (LLM generation disabled, assistant enabled) and exercises the
 * swipe_index INSERT for every call.
 */
const testConfig = {
  assistant: { enabled: true, },
  encryption: { compressThreshold: 1024, compressAlgorithm: "gzip" as const, },
  generation: {
    providers: { openaiCompatible: [], },
    defaultProvider: null,
  },
} as unknown as Config;

describe("maybeAutoReply — swipe_index race", () => {
  let db: Kysely<DB>;
  let chatId: string;
  let actorId: string;
  let parentMessageId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());

    const userId = uid();
    await insertUsers(db, `user-${userId}`, "Test User", { id: userId, } as never,);
    actorId = userId;
    // messages.actor_id → actors.id; create the matching actor row.
    await db
      .insertInto("actors",)
      .values({
        id: actorId,
        actor_type: "user",
        display_name: "Test Actor",
        user_id: userId,
        owner_id: userId,
        agent_type: "none",
        settings: "{}",
        format_version: 0,
        visibility: "private",
        import_spec: "{}",
      },)
      .execute();

    chatId = uid();
    await insertChats(db, "Race Test Chat", actorId, { id: chatId, } as never,);

    parentMessageId = uid();
    await insertMessages(db, chatId, actorId, MessageRole.User, "hello world", {
      id: parentMessageId,
      swipe_index: 0,
    } as never,);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test(
    "concurrent maybeAutoReply calls produce distinct swipe_indexes for the same parent",
    async () => {
      const fanout = 8;
      const results = await Promise.all(
        Array.from({ length: fanout, }, () =>
          maybeAutoReply(
            db,
            testConfig,
            chatId,
            actorId,
            parentMessageId,
            "hello", // matches assistant "hello" keyword → generateResponse returns content
            new Request("http://localhost/",),
          ),),
      );

      // Every call should report a synchronous assistant reply.
      expect(results.every((r,) => r.replied),).toBe(true,);

      // Read back all swipe_indexes for this (chat, parent) — must be
      // a contiguous distinct sequence with no gaps and no duplicates.
      const swipes = await db
        .selectFrom("messages",)
        .select("swipe_index",)
        .where("chat_id", "=", chatId,)
        .where("parent_id", "=", parentMessageId,)
        .where("role", "=", MessageRole.Assistant,)
        .orderBy("swipe_index", "asc",)
        .execute();

      const indexes = swipes.map((r,) => r.swipe_index);
      expect(indexes,).toHaveLength(fanout,);
      expect(new Set(indexes,).size,).toBe(fanout,); // all distinct
      expect(indexes,).toEqual([1, 2, 3, 4, 5, 6, 7, 8,],); // contiguous
    },
  );

  test("returns 503 service_busy when all swipe retries collide", async () => {
    // Force unique-index collisions by pre-filling all swipe slots 1-8
    const fillId = uid();
    await insertMessages(db, chatId, actorId, MessageRole.User, "fill", { id: fillId, } as never,);
    for (let i = 1; i <= 8; i++) {
      await insertMessages(db, chatId, actorId, MessageRole.Assistant, "fill", {
        parent_id: fillId,
        swipe_index: i,
      } as never,);
    }

    const result = await maybeAutoReply(
      db,
      testConfig,
      chatId,
      actorId,
      fillId,
      "hello",
      new Request("http://localhost/",),
    );

    // Should return a 503 response, not throw
    expect(result.replied,).toBe(true,);
    expect(result.response,).toBeDefined();
    expect(result.response!.status,).toBe(503,);
  });

  test("returns replied:false when neither LLM generation nor the assistant is enabled", async () => {
    // TS2366 regression guard: with both paths off, maybeAutoReply fell off
    // the end returning undefined against its declared
    // Promise<{ replied: boolean }>; the caller's `result.replied` then read
    // a property off undefined.
    const offConfig = {
      ...testConfig,
      assistant: { enabled: false, },
    } as unknown as Config;
    const result = await maybeAutoReply(
      db,
      offConfig,
      chatId,
      actorId,
      parentMessageId,
      "hello",
      new Request("http://localhost/",),
    );
    expect(result,).toBeDefined();
    expect(result.replied,).toBe(false,);
    expect(result.response,).toBeUndefined();
  });
});

describe("maybeAutoReply — asyncStore forwarding (BUG-register-plugins-discards-asyncStore)", () => {
  let db: Kysely<DB>;
  let chatId: string;
  let actorId: string;
  let parentMessageId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());

    const userId = uid();
    await insertUsers(db, `user-${userId}`, "Test User", { id: userId, } as never,);
    actorId = userId;
    await db
      .insertInto("actors",)
      .values({
        id: actorId,
        actor_type: "user",
        display_name: "Test Actor",
        user_id: userId,
        owner_id: userId,
        agent_type: "none",
        settings: "{}",
        format_version: 0,
        visibility: "private",
        import_spec: "{}",
      },)
      .execute();

    chatId = uid();
    await insertChats(db, "AsyncStore Forward Test", actorId, { id: chatId, } as never,);

    parentMessageId = uid();
    await insertMessages(db, chatId, actorId, MessageRole.User, "hello world", {
      id: parentMessageId,
      swipe_index: 0,
    } as never,);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  /** In-memory AsyncStore mock capturing every track() call. */
  function makeAsyncStoreMock(): AsyncStore & { tracks: Array<{ id: string; method: string; routePattern: string; userId: string | null; }>; } {
    const tracks: Array<{ id: string; method: string; routePattern: string; userId: string | null; }> = [];
    return {
      tracks,
      track(input: { id: string; method: string; routePattern: string; userId: string | null; },) {
        tracks.push(input,);
      },
      // The remaining AsyncStore methods are unused by maybeAutoReply but
      // required by the structural interface. Provide no-op stubs.
      progress() { /* noop */ },
      complete() { /* noop */ },
      fail() { /* noop */ },
      read: async () => null,
      flush: async () => undefined,
      config: { offloadThresholdBytes: 0, baseDir: "/tmp/async-store-test", },
    } as unknown as AsyncStore & { tracks: Array<{ id: string; method: string; routePattern: string; userId: string | null; }>; };
  }

  test("calls asyncStore.track() when requestId header + asyncStore are both supplied", async () => {
    const store = makeAsyncStoreMock();
    const requestId = "req-test-123";
    const request = new Request("http://localhost/", {
      method: "POST",
      headers: { "x-request-id": requestId, },
    },);

    await maybeAutoReply(
      db,
      testConfig,
      chatId,
      actorId,
      parentMessageId,
      "hello",
      request,
      store,
    );

    expect(store.tracks,).toHaveLength(1,);
    expect(store.tracks[0]?.id,).toBe(requestId,);
    expect(store.tracks[0]?.method,).toBe("POST",);
    expect(store.tracks[0]?.routePattern,).toBe(`/api/chats/${chatId}/messages`,);
    expect(store.tracks[0]?.userId,).toBe(actorId,);
  });

  test("does NOT call asyncStore.track() when asyncStore is undefined (defensive)", async () => {
    // No asyncStore — track() should be a silent no-op (the old broken
    // wiring). The test guards against regressing that — if the optional
    // chain ever becomes a hard call, this will throw at the unstubbed
    // store.track reference.
    const requestId = "req-test-456";
    const request = new Request("http://localhost/", {
      method: "POST",
      headers: { "x-request-id": requestId, },
    },);

    const result = await maybeAutoReply(
      db,
      testConfig,
      chatId,
      actorId,
      parentMessageId,
      "hello",
      request,
      // asyncStore intentionally omitted
    );
    // Synchronous rule-based assistant path; must reply successfully.
    expect(result.replied,).toBe(true,);
  });
});
