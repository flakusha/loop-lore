// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for generation-routes/cancel.ts — POST /api/generation/cancel.
 *
 * Covers validateCancel's type rejections, chatId/attemptId resolution and
 * precedence, custom reason/source/detail echo, the authorization boundary
 * (participants and admins may cancel; outsiders are refused before any
 * state is touched), and the not-found paths for missing or already
 * cancelled generations. Uses a real in-memory DB and the real
 * cancellation-tracker maps.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { CancelReason, CancelSource, GenerationStatus, PolicyType, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import type { TestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChatParticipants,
  insertChats,
  insertUsers,
} from "../../test-utils/insert-helpers";
import { GenerationCancelledError, } from "../cancellation-actions/error";
import {
  type ActiveGeneration,
  activeGenerations,
  chatToAttempt,
} from "../cancellation-tracker";
import { handleCancelGeneration, } from "./cancel";

createLogger({ level: "error", },);

// ── Fixtures ──────────────────────────────────────────────
// Parallel-safety: each test gets its own in-memory DB via createTestDb()
// and unique IDs — no shared mutable state.

let ownerId = "";
let outsiderId = "";
let chatId = "";
let testDb: Kysely<DB> | null = null;
let sqlite: TestDb["sqlite"] | null = null;

/** Fresh DB with one chat (owner) + one outsider (no participation). */
async function makeFixtures(): Promise<void> {
  const { db, sqlite: raw, } = await createTestDb();
  testDb = db;
  sqlite = raw;

  ownerId = `owner-${crypto.randomUUID()}`;
  outsiderId = `outsider-${crypto.randomUUID()}`;
  chatId = `chat-${crypto.randomUUID()}`;

  await insertUsers(db, `${ownerId}-user`, "Owner", { id: ownerId, } as never,);
  await insertUsers(db, `${outsiderId}-user`, "Outsider", { id: outsiderId, } as never,);
  await insertActors(db, "Owner", { id: ownerId, actor_type: "user", user_id: ownerId, } as never,);
  await insertActors(db, "Outsider", { id: outsiderId, actor_type: "user", user_id: outsiderId, } as never,);
  await insertChats(db, "Test Chat", ownerId, { id: chatId, } as never,);
  await insertChatParticipants(db, chatId, ownerId, { role_in_chat: "owner", } as never,);
}

afterEach(() => {
  if (sqlite) { sqlite.close(); }
  sqlite = null;
  testDb = null;
},);

// ── In-memory tracking seeds ──────────────────────────────

beforeEach(() => {
  activeGenerations.clear();
  chatToAttempt.clear();
},);

/**
 * Register an active generation directly in the tracker maps (the same
 * state startGenerationTracking produces). cancelGeneration reads the
 * abort controller and repetition detector off the entry, so both are
 * seeded with working stubs.
 * @param overrides
 */
function seedActive(overrides: { chatId?: string; aborted?: boolean } = {},): string {
  const targetChat = overrides.chatId ?? chatId;
  const attemptId = `att-${crypto.randomUUID()}`;
  const abortController = new AbortController();
  if (overrides.aborted) {
    abortController.abort(new GenerationCancelledError(CancelReason.UserCancel, CancelSource.User, "already",),);
  }
  activeGenerations.set(
    attemptId,
    {
      attemptId,
      chatId: targetChat,
      parentMessageId: "parent-1",
      actorId: "actor-1",
      status: GenerationStatus.Streaming,
      startedAt: Date.now(),
      chunksReceived: 0,
      charsReceived: 0,
      abortController,
      repetitionDetector: { getBufferText: () => "", } as never,
      policyConfig: { expectedPolicy: PolicyType.Sfw, cancel: true, },
      responseLimitConfig: { maxResponses: 1, isGroupChat: false, currentCount: 0, },
      streaming: true,
      stepIndex: 0,
      totalSteps: 1,
      lastRenderedChunkIndex: -1,
      deliveryConfirmed: false,
    } satisfies ActiveGeneration,
  );
  chatToAttempt.set(targetChat, attemptId,);
  return attemptId;
}

// ── Tests ──────────────────────────────────────────────────

describe("handleCancelGeneration", () => {
  test("returns 401 when unauthenticated", async () => {
    await makeFixtures();
    const res = await handleCancelGeneration({ chatId, }, testDb!,);
    expect(res.status,).toBe(401,);
  });

  test("rejects non-object bodies", async () => {
    await makeFixtures();
    for (const body of [null, "str", 42, true,]) {
      const res = await handleCancelGeneration(body, testDb!, ownerId,);
      expect(res.status,).toBe(400,);
      const data = (await res.json()) as { error: string };
      expect(data.error,).toBe("Invalid request body",);
    }
  });

  test("rejects non-string chatId/attemptId/reason/source/detail fields", async () => {
    await makeFixtures();
    const bodies = [
      { chatId: 123, },
      { attemptId: {}, },
      { chatId: "c", reason: 42, },
      { chatId: "c", source: [], },
      { chatId: "c", detail: true, },
    ];
    for (const body of bodies) {
      const res = await handleCancelGeneration(body, testDb!, ownerId,);
      expect(res.status,).toBe(400,);
      const data = (await res.json()) as { error: string };
      expect(data.error,).toBe("Invalid request body",);
    }
  });

  test("returns 400 when neither chatId nor attemptId is given", async () => {
    await makeFixtures();
    const res = await handleCancelGeneration({ reason: "x", }, testDb!, ownerId,);
    expect(res.status,).toBe(400,);
    const data = (await res.json()) as { error: string };
    expect(data.error,).toBe("Either chatId or attemptId is required",);
  });

  test("cancels by chatId and clears the in-memory tracking", async () => {
    await makeFixtures();
    const attemptId = seedActive();
    const res = await handleCancelGeneration({ chatId, }, testDb!, ownerId,);
    expect(res.status,).toBe(200,);
    const data = (await res.json()) as { ok: boolean; chatId: string; reason: string; source: string; detail: string };
    expect(data.ok,).toBe(true,);
    expect(data.chatId,).toBe(chatId,);
    expect(data.reason,).toBe(CancelReason.UserCancel,);
    expect(data.source,).toBe(CancelSource.User,);
    expect(data.detail,).toBe("User requested cancellation",);
    expect(activeGenerations.has(attemptId,),).toBe(false,);
    expect(chatToAttempt.has(chatId,),).toBe(false,);
  });

  test("cancels by attemptId only, resolving the chat from active generations", async () => {
    await makeFixtures();
    const attemptId = seedActive();
    const res = await handleCancelGeneration({ attemptId, }, testDb!, ownerId,);
    expect(res.status,).toBe(200,);
    const data = (await res.json()) as { ok: boolean; chatId: string };
    expect(data.ok,).toBe(true,);
    expect(data.chatId,).toBe(chatId,);
    expect(activeGenerations.has(attemptId,),).toBe(false,);
  });

  test("returns 404 when the attemptId matches no active generation", async () => {
    await makeFixtures();
    const res = await handleCancelGeneration({ attemptId: "att-missing", }, testDb!, ownerId,);
    expect(res.status,).toBe(404,);
    const data = (await res.json()) as { error: string };
    expect(data.error,).toBe("No active generation found for the given ID",);
  });

  test("echoes custom reason/source/detail in the response", async () => {
    await makeFixtures();
    seedActive();
    const res = await handleCancelGeneration(
      {
        chatId,
        reason: CancelReason.ChatSwitch,
        source: CancelSource.ChatSwitch,
        detail: "user switched chats",
      },
      testDb!,
      ownerId,
    );
    expect(res.status,).toBe(200,);
    const data = (await res.json()) as { reason: string; source: string; detail: string };
    expect(data.reason,).toBe(CancelReason.ChatSwitch,);
    expect(data.source,).toBe(CancelSource.ChatSwitch,);
    expect(data.detail,).toBe("user switched chats",);
  });

  test("chatId takes precedence over attemptId when both are given", async () => {
    await makeFixtures();
    const chat2 = `chat2-${crypto.randomUUID()}`;
    await insertChats(testDb!, "Chat 2", ownerId, { id: chat2, } as never,);
    const attempt1 = seedActive({ chatId, },);
    const attempt2 = seedActive({ chatId: chat2, },);
    const res = await handleCancelGeneration({ chatId, attemptId: attempt2, }, testDb!, ownerId,);
    expect(res.status,).toBe(200,);
    const data = (await res.json()) as { chatId: string };
    expect(data.chatId,).toBe(chatId,);
    expect(activeGenerations.has(attempt1,),).toBe(false,);
    expect(activeGenerations.has(attempt2,),).toBe(true,);
  });

  test("returns 404 when the chat has no active generation to cancel", async () => {
    await makeFixtures();
    const res = await handleCancelGeneration({ chatId, }, testDb!, ownerId,);
    expect(res.status,).toBe(404,);
    const data = (await res.json()) as { error: string };
    expect(data.error,).toBe("No active generation found or already cancelled",);
  });

  test("returns 404 when the tracked generation was already aborted", async () => {
    await makeFixtures();
    seedActive({ aborted: true, },);
    const res = await handleCancelGeneration({ chatId, }, testDb!, ownerId,);
    expect(res.status,).toBe(404,);
    const data = (await res.json()) as { error: string };
    expect(data.error,).toBe("No active generation found or already cancelled",);
  });

  test("lets an admin cancel a generation in a chat they do not participate in", async () => {
    await makeFixtures();
    const attemptId = seedActive();
    const res = await handleCancelGeneration({ chatId, }, testDb!, outsiderId, "admin",);
    expect(res.status,).toBe(200,);
    expect(activeGenerations.has(attemptId,),).toBe(false,);
  });

  test("forbids a non-participant from cancelling by attemptId", async () => {
    await makeFixtures();
    const attemptId = seedActive();
    const res = await handleCancelGeneration({ attemptId, }, testDb!, outsiderId,);
    expect(res.status,).toBe(403,);
    expect(activeGenerations.has(attemptId,),).toBe(true,);
  });
});
