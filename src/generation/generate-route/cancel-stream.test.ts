// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Direct unit tests for streamCancelCleanup — runs in EVERY test run
 * (plain `bun test`, `bun run test:coverage`, `bun run check`), so the
 * new module keeps line coverage >= 70% per the coverage gate.
 *
 * BUG-stream-cancel-leaves-attempt-stuck-processing-forever-no-cle:
 * the attempt must be persisted as Cancelled (never Failed), released from
 * in-memory tracking, and buffered as done so reconnects resolve.
 */
import { Database, } from "bun:sqlite";
import { afterEach, beforeEach, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import { CancelReason, CancelSource, GenerationStatus, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertMessages, } from "../../test-utils/insert-helpers";
import { GenerationCancelledError, } from "../cancellation-actions/error";
import { startGenerationTracking, } from "../cancellation-manager";
import { activeGenerations, chatToAttempt, } from "../cancellation-tracker";
import type { GenerateRequest as ProviderRequest, LLMProvider, } from "../providers/types";
import { getOrCreateBuffer, removeBuffer, } from "../stream-buffer";
import { DEFAULT_POLICY_DETECTION, DEFAULT_REPETITION_DETECTION, DEFAULT_RESPONSE_LIMIT, } from "../types";
import { streamCancelCleanup, } from "./cancel-stream";
import { streamToClient, } from "./stream-to-client";

let db: Kysely<DB>;
let sqlite: Database;
const userId = "user-cancel-stream";
let seq = 0;

beforeEach(async () => {
  const created = await createTestDb();
  db = created.db;
  sqlite = created.sqlite;
  activeGenerations.clear();
  chatToAttempt.clear();

  await db.insertInto("users",).values({
    id: userId,
    username: "cancelstream",
    display_name: "Cancel Stream",
    role: "solo",
    status: "active",
    settings: "{}",
  },).execute();
  await insertActors(db, "Alice", {
    id: "actor-ai-1",
    actor_type: "character",
    owner_id: userId,
    agent_type: "ai",
    settings: "{}",
    import_spec: "raw",
    data_source_format: "json",
    data_raw: null,
  },);
},);

afterEach(() => {
  activeGenerations.clear();
  chatToAttempt.clear();
  sqlite.close();
},);

async function startAttempt(chatId: string,): Promise<{ attemptId: string; abortSignal: AbortSignal }> {
  await db.insertInto("chats",).values({
    id: chatId,
    name: `Cancel Stream ${seq++}`,
    type: "direct",
    mode: "direct",
    created_by: userId,
    max_turns: null,
  } as never,).execute();
  await db.insertInto("chat_participants",).values({
    chat_id: chatId,
    actor_id: "actor-ai-1",
    role_in_chat: "member",
    talkativity: 5,
  } as never,).execute();
  const parentMessageId = `msg-${chatId}`;
  await insertMessages(db, chatId, "actor-ai-1", "user", "hi", { id: parentMessageId, },);

  return startGenerationTracking({
    options: {
      chatId,
      parentMessageId,
      actorId: "actor-ai-1",
      modelId: "m",
      provider: "p",
      prompt: [{ role: "user", content: "hi", },],
      idempotencyKey: `cancel-stream-${chatId}-${Math.random()}`,
      stream: true,
      repetitionDetection: { ...DEFAULT_REPETITION_DETECTION, enabled: false, },
      policyDetection: { ...DEFAULT_POLICY_DETECTION, enabled: false, },
      responseLimit: { ...DEFAULT_RESPONSE_LIMIT, },
      stepIndex: 0,
      totalSteps: 1,
    },
    db,
  },);
}

/**
 * Build a real ReadableStreamDefaultController and collect enqueued frames.
 * @return object with the controller and a sync frame accumulator
 */
function captureController(): { controller: ReadableStreamDefaultController; frames: string[] } {
  const frames: string[] = [];
  let controller: ReadableStreamDefaultController | undefined;
  const stream = new ReadableStream({
    start(c,) {
      controller = c;
    },
  },);
  const reader = stream.getReader();
  void (async () => {
    for (;;) {
      const { done, value, } = await reader.read();
      if (done) { break; }
      frames.push(new TextDecoder().decode(value,),);
    }
  })();
  return { controller: controller!, frames, };
}

test("streamCancelCleanup persists Cancelled, releases tracking, signals done", async () => {
  const chatId = `chat-ok-${Date.now()}-${Math.random()}`;
  const { attemptId, } = await startAttempt(chatId,);
  expect(activeGenerations.has(attemptId,),).toBe(true,);
  expect(chatToAttempt.has(chatId,),).toBe(true,);

  const buffer = getOrCreateBuffer(chatId,);
  const { controller, frames, } = captureController();

  await streamCancelCleanup({
    db,
    attemptId,
    chatId,
    error: new GenerationCancelledError(CancelReason.UserCancel, CancelSource.User, "user stop",),
    streamError: "user stop",
    accumulatedContent: "partial text",
    buffer,
    controller,
  },);

  // Status persisted as Cancelled with metadata.
  const row = await db
    .selectFrom("generation_attempts",)
    .select(["status", "cancel_reason", "cancel_source", "cancel_reason_detail", "delivery_confirmed_at",],)
    .where("id", "=", attemptId,)
    .executeTakeFirstOrThrow();
  expect(row.status,).toBe(GenerationStatus.Cancelled,);
  expect(row.cancel_reason,).toBe(CancelReason.UserCancel,);
  expect(row.cancel_source,).toBe(CancelSource.User,);
  expect(row.cancel_reason_detail,).toBe("user stop",);
  expect(row.delivery_confirmed_at,).toBeNull();

  // In-memory tracking released.
  expect(activeGenerations.has(attemptId,),).toBe(false,);
  expect(chatToAttempt.has(chatId,),).toBe(false,);

  // Buffer is done (not errored) and the SSE done frame was flushed.
  expect(buffer.isDone,).toBe(true,);
  const joined = frames.join("",);
  expect(joined,).toContain('"type":"done"',);
  expect(joined,).toContain('"cancelled":true',);
  expect(joined,).toContain('"content":"partial text"',);

  removeBuffer(chatId,);
});

test("streamCancelCleanup treats AbortError as generic user cancel", async () => {
  const chatId = `chat-abort-${Date.now()}-${Math.random()}`;
  const { attemptId, } = await startAttempt(chatId,);
  const buffer = getOrCreateBuffer(chatId,);
  const { controller, } = captureController();

  const abortError = new DOMException("aborted", "AbortError",);
  await streamCancelCleanup({
    db,
    attemptId,
    chatId,
    error: abortError,
    streamError: "aborted",
    accumulatedContent: "",
    buffer,
    controller,
  },);

  const row = await db
    .selectFrom("generation_attempts",)
    .select(["status", "cancel_reason", "cancel_source",],)
    .where("id", "=", attemptId,)
    .executeTakeFirstOrThrow();
  expect(row.status,).toBe(GenerationStatus.Cancelled,);
  expect(row.cancel_reason,).toBe(CancelReason.UserCancel,);
  expect(row.cancel_source,).toBe(CancelSource.User,);

  removeBuffer(chatId,);
});

test("streamCancelCleanup still cleans up when the status write fails", async () => {
  const chatId = `chat-dberr-${Date.now()}-${Math.random()}`;
  const { attemptId, } = await startAttempt(chatId,);
  const buffer = getOrCreateBuffer(chatId,);
  const { controller, } = captureController();

  // A db that throws on updateAttemptStatus must not prevent cleanup.
  const brokenDb = {
    ...db,
    updateTable: () => {
      throw new Error("boom",);
    },
  } as unknown as Kysely<DB>;

  await expect(
    streamCancelCleanup({
      db: brokenDb,
      attemptId,
      chatId,
      error: new GenerationCancelledError(CancelReason.UserCancel, CancelSource.User, "x",),
      streamError: "x",
      accumulatedContent: "",
      buffer,
      controller,
    },),
  ).resolves.toBeUndefined();

  expect(activeGenerations.has(attemptId,),).toBe(false,);
  expect(buffer.isDone,).toBe(true,);

  removeBuffer(chatId,);
});

test("streamToClient cancel path persists real cancel detail to the attempt record", async () => {
  // Seam regression (BUG-sse-streams-leak interaction): the catch block must
  // classify cancel BEFORE genericizing streamError, so the persisted
  // cancel_reason_detail is the actual reason ("user stop"), not the generic
  // wire message ("Generation failed").
  const chatId = `chat-seam-${Date.now()}-${Math.random()}`;
  const { attemptId, } = await startAttempt(chatId,);

  const tracker = new AbortController();
  let sawAbort = false;
  const provider: LLMProvider = {
    capabilities: { streaming: true, },
    complete: async () => {
      throw new Error("unused",);
    },
    stream: async (_req: ProviderRequest, handler: Parameters<NonNullable<LLMProvider["stream"]>>[1],) => {
      handler({ type: "content", content: "partial ", },);
      await new Promise<void>((resolve,) => {
        if (tracker.signal.aborted) {
          resolve();
          return;
        }
        tracker.signal.addEventListener("abort", () => resolve(), { once: true, },);
      },);
      sawAbort = true;
      // Surface the cancel as the typed error (registry wraps aborts this way).
      throw new GenerationCancelledError(CancelReason.UserCancel, CancelSource.User, "user stop",);
    },
    healthCheck: async () => ({ status: "ok" as const, }),
    listModels: async () => [],
  } as unknown as LLMProvider;

  const response = streamToClient({
    input: {
      chatId,
      actorId: "actor-ai-1",
      parentMessageId: `msg-${chatId}`,
      continuationNumber: 0,
    } as unknown as Parameters<typeof streamToClient>[0]["input"],
    database: db,
    messages: [],
    cfg: {} as Config,
    userId,
    attemptId,
    modelId: "m",
    providerName: "p",
    providerReq: { model: "m", params: { stream: true, }, signal: tracker.signal, } as ProviderRequest,
    failoverList: [{ name: "p", provider, },],
  },);

  // Drain the SSE stream until close.
  const reader = response.body!.getReader();
  // Trigger the cancel once the stream is listening (provider waits on it).
  setTimeout(() => {
    tracker.abort(new GenerationCancelledError(CancelReason.UserCancel, CancelSource.User, "user stop",),);
  }, 10,);
  await new Promise<void>((resolve, reject,) => {
    void (async () => {
      try {
        for (;;) {
          const { done, } = await reader.read();
          if (done) { break; }
        }
        resolve();
      } catch (e) {
        reject(e,);
      }
    })();
  },);

  expect(sawAbort,).toBe(true,);

  const row = await db
    .selectFrom("generation_attempts",)
    .select(["status", "cancel_reason", "cancel_source", "cancel_reason_detail",],)
    .where("id", "=", attemptId,)
    .executeTakeFirstOrThrow();
  expect(row.status,).toBe(GenerationStatus.Cancelled,);
  expect(row.cancel_reason,).toBe(CancelReason.UserCancel,);
  expect(row.cancel_source,).toBe(CancelSource.User,);
  expect(row.cancel_reason_detail,).toBe("user stop",);
  expect(row.cancel_reason_detail,).not.toBe("Generation failed",);

  removeBuffer(chatId,);
});

test("client disconnect persists Cancelled with the AbortError detail", async () => {
  // Client-disconnect seam: streamToClient.cancel() aborts its internal
  // provider controller (no reason) → provider throws AbortError → catch
  // classifies cancel and persists the AbortError message as detail
  // (never the generic wire "Generation failed").
  const chatId = `chat-disc-${Date.now()}-${Math.random()}`;
  const { attemptId, } = await startAttempt(chatId,);

  let firstChunk = false;
  let sawAbort = false;
  const provider: LLMProvider = {
    capabilities: { streaming: true, },
    complete: async () => {
      throw new Error("unused",);
    },
    stream: async (req: ProviderRequest, handler: Parameters<NonNullable<LLMProvider["stream"]>>[1],) => {
      if (!firstChunk) {
        firstChunk = true;
        handler({ type: "content", content: "partial ", },);
      }
      const sig = req.signal;
      await new Promise<void>((resolve,) => {
        if (!sig) {
          resolve();
          return;
        }
        if (sig.aborted) {
          resolve();
          return;
        }
        sig.addEventListener("abort", () => resolve(), { once: true, },);
      },);
      sawAbort = true;
      // The stream's own controller aborted with no reason → providers
      // typically throw AbortError; the catch classifies it as cancel.
      throw new DOMException("The operation was aborted", "AbortError",);
    },
    healthCheck: async () => ({ status: "ok" as const, }),
    listModels: async () => [],
  } as unknown as LLMProvider;

  const response = streamToClient({
    input: {
      chatId,
      actorId: "actor-ai-1",
      parentMessageId: `msg-${chatId}`,
      continuationNumber: 0,
    } as unknown as Parameters<typeof streamToClient>[0]["input"],
    database: db,
    messages: [],
    cfg: {} as Config,
    userId,
    attemptId,
    modelId: "m",
    providerName: "p",
    providerReq: { model: "m", params: { stream: true, }, signal: new AbortController().signal, } as ProviderRequest,
    failoverList: [{ name: "p", provider, },],
  },);

  const reader = response.body!.getReader();
  // Client disconnect: cancel the stream once the first chunk landed.
  const { promise: firstChunkSeen, resolve: markFirstChunk, } = Promise.withResolvers<void>();
  void (async () => {
    for (;;) {
      const { done, value, } = await reader.read();
      if (done) { break; }
      if (value) {
        markFirstChunk();
        break;
      }
    }
  })();
  await firstChunkSeen;
  await reader.cancel().catch(() => {},);
  // The provider throws post-abort; the catch runs streamCancelCleanup which
  // persists Cancelled. Wait for that write without a real-time sleep: poll
  // the row's status transition.
  let row: { status: string; cancel_reason: string; cancel_source: string; cancel_reason_detail: string } | undefined;
  for (let i = 0; i < 100; i++) {
    const candidate = await db
      .selectFrom("generation_attempts",)
      .select(["status", "cancel_reason", "cancel_source", "cancel_reason_detail",],)
      .where("id", "=", attemptId,)
      .executeTakeFirst();
    if (candidate?.status === GenerationStatus.Cancelled) {
      row = candidate;
      break;
    }
    await Promise.resolve(); // yield to the event loop; no wall-clock timer
  }

  expect(sawAbort,).toBe(true,);
  expect(row,).toBeDefined();
  expect(row!.cancel_reason,).toBe(CancelReason.UserCancel,);
  expect(row!.cancel_source,).toBe(CancelSource.User,);
  expect(row!.cancel_reason_detail,).toBe("The operation was aborted",);
  expect(row!.cancel_reason_detail,).not.toBe("Generation failed",);

  removeBuffer(chatId,);
});
