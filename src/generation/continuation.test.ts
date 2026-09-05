import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { setTestDatabase, } from "../db/index";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, resetTestDb, } from "../test-utils/create-test-db";
import {
  clearPartialContent,
  getAttemptForMessage,
  getPartialContent,
  mapMessageToAttempt,
  storePartialContent,
} from "./continuation";
import { handleContinueGeneration, handleRetryGeneration, } from "./generation-routes";

// ── Test DB ──────────────────────────────────────────────────

let testDb: Kysely<DB>;
let testSqlite: Database;

beforeAll(async () => {
  const env = await createTestDb();
  testDb = env.db;
  testSqlite = env.sqlite;
},);

beforeEach(() => {
  clearPartialContent();
  setTestDatabase(testDb,);
  resetTestDb(testSqlite,);
},);

afterAll(() => {
  setTestDatabase(null,);
  testSqlite.close();
},);

// ── Continuation module: in-memory tests ────────────────────

describe("storePartialContent / getPartialContent (in-memory)", () => {
  test("stores and retrieves partial content", async () => {
    storePartialContent("attempt-1", "Hello, this is partial",);
    const result = await getPartialContent("attempt-1", testDb,);
    expect(result.content,).toBe("Hello, this is partial",);
  });

  test("returns null for unknown attempt", async () => {
    const result = await getPartialContent("nonexistent", testDb,);
    expect(result.content,).toBeNull();
  });

  test("overwrites existing content", async () => {
    storePartialContent("attempt-1", "Old content",);
    storePartialContent("attempt-1", "New content",);
    const result = await getPartialContent("attempt-1", testDb,);
    expect(result.content,).toBe("New content",);
  });

  test("clearPartialContent removes all stored content", async () => {
    storePartialContent("attempt-1", "Some content",);
    clearPartialContent();
    const result = await getPartialContent("attempt-1", testDb,);
    expect(result.content,).toBeNull();
  });
});

describe("getPartialContent — DB fallback", () => {
  beforeEach(async () => {
    // Seed parent rows for FK constraints
    await testDb.insertInto("users",).values({
      id: "user-1",
      username: "test",
      display_name: "Test",
      role: "user",
      status: "active",
      settings: "{}",
    },).execute();
    await testDb.insertInto("chats",).values({
      id: "chat-1",
      name: "Test Chat",
      type: "direct",
      mode: "direct",
      created_by: "user-1",
    },).execute();
    await testDb.insertInto("actors",).values({
      id: "actor-1",
      actor_type: "character",
      display_name: "AI",
      agent_type: "ai",
      settings: "{}",
      format_version: 0,
      import_spec: "{}",
    },).execute();
    await testDb.insertInto("messages",).values({
      id: "msg-1",
      chat_id: "chat-1",
      actor_id: "actor-1",
      role: "assistant",
      content: "",
      content_type: "text",
      content_format: "markdown",
      content_encoding: "identity",
      status: "confirmed",
      visibility: "visible",
    },).execute();

    await testDb
      .insertInto("generation_attempts",)
      .values({
        id: "db-attempt-1",
        chat_id: "chat-1",
        parent_message_id: "msg-1",
        actor_id: "actor-1",
        idempotency_key: "key-1",
        model_id: "test-model",
        provider: "test",
        status: "cancelled",
        partial_content: "DB stored partial content",
        step_index: 0,
        total_steps: 1,
      },)
      .execute();
  },);

  test("falls back to DB when not in memory", async () => {
    const result = await getPartialContent("db-attempt-1", testDb,);
    expect(result.content,).toBe("DB stored partial content",);
  });

  test("in-memory takes precedence over DB", async () => {
    storePartialContent("db-attempt-1", "Memory override",);
    const result = await getPartialContent("db-attempt-1", testDb,);
    expect(result.content,).toBe("Memory override",);
  });

  test("returns null for attempt with null partial_content", async () => {
    await testDb
      .insertInto("generation_attempts",)
      .values({
        id: "db-attempt-2",
        chat_id: "chat-1",
        parent_message_id: "msg-1",
        actor_id: "actor-1",
        idempotency_key: "key-2",
        model_id: "test-model",
        provider: "test",
        status: "completed",
        partial_content: null,
        step_index: 0,
        total_steps: 1,
      },)
      .execute();
    const result = await getPartialContent("db-attempt-2", testDb,);
    expect(result.content,).toBeNull();
  });
});

describe("mapMessageToAttempt / getAttemptForMessage", () => {
  test("maps message to attempt and retrieves", () => {
    mapMessageToAttempt("msg-1", "attempt-1",);
    expect(getAttemptForMessage("msg-1",),).toBe("attempt-1",);
  });

  test("returns undefined for unmapped message", () => {
    expect(getAttemptForMessage("unknown-msg",),).toBeUndefined();
  });

  test("overwrites existing mapping", () => {
    mapMessageToAttempt("msg-1", "attempt-1",);
    mapMessageToAttempt("msg-1", "attempt-2",);
    expect(getAttemptForMessage("msg-1",),).toBe("attempt-2",);
  });

  test("clearPartialContent clears mappings", () => {
    mapMessageToAttempt("msg-1", "attempt-1",);
    clearPartialContent();
    expect(getAttemptForMessage("msg-1",),).toBeUndefined();
  });
});

// ── Controller: handleContinueGeneration ─────────────────────

describe("handleContinueGeneration", () => {
  beforeEach(async () => {
    await testDb
      .insertInto("users",)
      .values({
        id: "user-1",
        username: "test",
        display_name: "Test",
        role: "user",
        status: "active",
        settings: "{}",
      },)
      .execute();

    await testDb
      .insertInto("chats",)
      .values({ id: "chat-1", name: "Test Chat", type: "direct", mode: "direct", created_by: "user-1", },)
      .execute();

    await testDb
      .insertInto("actors",)
      .values({
        id: "actor-1",
        actor_type: "character",
        display_name: "AI",
        agent_type: "ai",
        settings: "{}",
        format_version: 0,
        import_spec: "{}",
      },)
      .execute();

    await testDb
      .insertInto("messages",)
      .values({
        id: "msg-1",
        chat_id: "chat-1",
        actor_id: "actor-1",
        role: "assistant",
        content: "Partial response...",
        content_type: "text",
        content_format: "markdown",
        content_encoding: "identity",
        status: "partial",
        visibility: "visible",
      },)
      .execute();
  },);

  test("returns 400 when messageId missing", async () => {
    const body = { chatId: "chat-1", actorId: "actor-1", };
    const response = await handleContinueGeneration(body, testDb, "user-1",);
    const data = (await response.json()) as Record<string, unknown>;
    expect(response.status,).toBe(400,);
    expect(data.error,).toContain("messageId",);
  });

  test("returns 404 when no cancelled/failed attempt exists", async () => {
    const body = { messageId: "msg-nonexistent", chatId: "chat-1", actorId: "actor-1", };
    const response = await handleContinueGeneration(body, testDb, "user-1",);
    expect(response.status,).toBe(404,);
  });

  test("returns 422 when partial content not available", async () => {
    await testDb
      .insertInto("generation_attempts",)
      .values({
        id: "attempt-no-partial",
        chat_id: "chat-1",
        parent_message_id: "msg-1",
        actor_id: "actor-1",
        idempotency_key: "key-nopartial",
        model_id: "test-model",
        provider: "test",
        status: "cancelled",
        partial_content: null,
        step_index: 0,
        total_steps: 1,
      },)
      .execute();

    const body = { messageId: "msg-1", chatId: "chat-1", actorId: "actor-1", };
    const response = await handleContinueGeneration(body, testDb, "user-1",);
    expect(response.status,).toBe(422,);
  });

  test("returns continue response with metadata on success", async () => {
    storePartialContent("attempt-cont-1", "Partial response so far...",);

    await testDb
      .insertInto("generation_attempts",)
      .values({
        id: "attempt-cont-1",
        chat_id: "chat-1",
        parent_message_id: "msg-1",
        actor_id: "actor-1",
        idempotency_key: "key-cont",
        model_id: "test-model",
        provider: "test",
        status: "cancelled",
        cancel_reason: "user_cancel",
        partial_content: "Partial response so far...",
        step_index: 0,
        total_steps: 1,
      },)
      .execute();

    const body = { messageId: "msg-1", chatId: "chat-1", actorId: "actor-1", };
    const response = await handleContinueGeneration(body, testDb, "user-1",);
    const data = (await response.json()) as Record<string, unknown>;

    expect(response.status,).toBe(200,);
    expect(data.ok,).toBe(true,);
    expect(data.parentAttemptId,).toBe("attempt-cont-1",);
    expect(data.partialContent,).toBe("Partial response so far...",);
    expect(data.chatId,).toBe("chat-1",);
    expect(data.messageId,).toBe("msg-1",);
    expect(data.actorId,).toBe("actor-1",);
    expect(data.modelId,).toBe("test-model",);
    expect(data.continueContext,).toBeDefined();
    expect((data.continueContext as Record<string, unknown>).parentAttemptId,).toBe("attempt-cont-1",);
  });

  test("increments continuationNumber with existing continuations", async () => {
    storePartialContent("attempt-parent", "Parent partial content",);

    await testDb
      .insertInto("generation_attempts",)
      .values({
        id: "attempt-parent",
        chat_id: "chat-1",
        parent_message_id: "msg-1",
        actor_id: "actor-1",
        idempotency_key: "key-parent",
        model_id: "test-model",
        provider: "test",
        status: "cancelled",
        partial_content: "Parent partial content",
        step_index: 0,
        total_steps: 1,
      },)
      .execute();

    await testDb
      .insertInto("generation_attempts",)
      .values({
        id: "attempt-cont-1-exists",
        chat_id: "chat-1",
        parent_message_id: "msg-1",
        actor_id: "actor-1",
        idempotency_key: "key-cont-1",
        model_id: "test-model",
        provider: "test",
        status: "completed",
        parent_attempt_id: "attempt-parent",
        step_index: 0,
        total_steps: 1,
      },)
      .execute();

    const body = { messageId: "msg-1", chatId: "chat-1", actorId: "actor-1", };
    const response = await handleContinueGeneration(body, testDb, "user-1",);
    const data = (await response.json()) as Record<string, unknown>;

    expect(data.continuationNumber,).toBe(2,);
  });
});

// ── Controller: handleRetryGeneration ───────────────────────

describe("handleRetryGeneration", () => {
  beforeEach(async () => {
    await testDb
      .insertInto("users",)
      .values({
        id: "user-1",
        username: "test",
        display_name: "Test",
        role: "user",
        status: "active",
        settings: "{}",
      },)
      .execute();

    await testDb
      .insertInto("chats",)
      .values({ id: "chat-1", name: "Test Chat", type: "direct", mode: "direct", created_by: "user-1", },)
      .execute();

    await testDb
      .insertInto("actors",)
      .values({
        id: "actor-1",
        actor_type: "character",
        display_name: "AI",
        agent_type: "ai",
        settings: "{}",
        format_version: 0,
        import_spec: "{}",
      },)
      .execute();

    await testDb
      .insertInto("messages",)
      .values({
        id: "msg-1",
        chat_id: "chat-1",
        actor_id: "actor-1",
        role: "assistant",
        content: "",
        content_type: "text",
        content_format: "markdown",
        content_encoding: "identity",
        status: "confirmed",
        visibility: "visible",
      },)
      .execute();
  },);

  test("returns 400 when chatId missing", async () => {
    const body = { attemptId: "some-attempt", };
    const response = await handleRetryGeneration(body, testDb, "user-1",);
    const data = (await response.json()) as Record<string, unknown>;
    expect(response.status,).toBe(400,);
    expect(data.error,).toContain("chatId",);
  });

  test("returns retry response with defaults when no step specified", async () => {
    const body = { chatId: "chat-1", };
    const response = await handleRetryGeneration(body, testDb, "user-1",);
    const data = (await response.json()) as Record<string, unknown>;
    expect(response.status,).toBe(200,);
    expect(data.ok,).toBe(true,);
    expect(data.chatId,).toBe("chat-1",);
    expect(data.resumeFromStep,).toBe(0,);
    expect(data.totalSteps,).toBe(1,);
  });

  test("returns 404 when attempt not found with specific attemptId", async () => {
    const body = { chatId: "chat-1", attemptId: "nonexistent-attempt", step: 0, };
    const response = await handleRetryGeneration(body, testDb, "user-1",);
    expect(response.status,).toBe(404,);
  });

  test("resumes from specified step when attempt exists", async () => {
    await testDb
      .insertInto("generation_attempts",)
      .values({
        id: "attempt-step-2",
        chat_id: "chat-1",
        parent_message_id: "msg-1",
        actor_id: "actor-1",
        idempotency_key: "key-step2",
        model_id: "test-model",
        provider: "test",
        status: "failed",
        step_index: 2,
        total_steps: 5,
      },)
      .execute();

    const body = { chatId: "chat-1", attemptId: "attempt-step-2", step: 2, };
    const response = await handleRetryGeneration(body, testDb, "user-1",);
    const data = (await response.json()) as Record<string, unknown>;
    expect(response.status,).toBe(200,);
    expect(data.resumeFromStep,).toBe(2,);
    expect(data.totalSteps,).toBe(5,);
  });

  test("caps step at total_steps - 1", async () => {
    await testDb
      .insertInto("generation_attempts",)
      .values({
        id: "attempt-step-cap",
        chat_id: "chat-1",
        parent_message_id: "msg-1",
        actor_id: "actor-1",
        idempotency_key: "key-cap",
        model_id: "test-model",
        provider: "test",
        status: "completed",
        step_index: 2,
        total_steps: 3,
      },)
      .execute();

    const body = { chatId: "chat-1", attemptId: "attempt-step-cap", step: 10, };
    const response = await handleRetryGeneration(body, testDb, "user-1",);
    const data = (await response.json()) as Record<string, unknown>;
    expect(data.resumeFromStep,).toBe(2,);
  });

  test("step without attemptId uses step as-is", async () => {
    const body = { chatId: "chat-1", step: 3, };
    const response = await handleRetryGeneration(body, testDb, "user-1",);
    const data = (await response.json()) as Record<string, unknown>;
    expect(data.resumeFromStep,).toBe(3,);
    expect(data.totalSteps,).toBe(1,);
  });

  test("negative step is clamped to 0", async () => {
    const body = { chatId: "chat-1", step: -5, };
    const response = await handleRetryGeneration(body, testDb, "user-1",);
    const data = (await response.json()) as Record<string, unknown>;
    expect(data.resumeFromStep,).toBe(0,);
  });
});

// ── Integration: cancel → partial content capture ──────────

describe("cancelGeneration captures partial content", () => {
  test("partial content from repetition detector is stored on cancel", async () => {
    createLogger({ level: "error", },);

    // Seed parent rows for FK constraints
    await testDb.insertInto("users",).values({
      id: "user-1",
      username: "test",
      display_name: "Test",
      role: "user",
      status: "active",
      settings: "{}",
    },).execute();
    await testDb.insertInto("chats",).values({
      id: "chat-cancel-test",
      name: "Cancel Test",
      type: "direct",
      mode: "direct",
      created_by: "user-1",
    },).execute();
    await testDb.insertInto("actors",).values({
      id: "actor-1",
      actor_type: "character",
      display_name: "AI",
      agent_type: "ai",
      settings: "{}",
      format_version: 0,
      import_spec: "{}",
    },).execute();
    await testDb.insertInto("messages",).values({
      id: "msg-cancel-test",
      chat_id: "chat-cancel-test",
      actor_id: "actor-1",
      role: "assistant",
      content: "",
      content_type: "text",
      content_format: "markdown",
      content_encoding: "identity",
      status: "confirmed",
      visibility: "visible",
    },).execute();

    const { startGenerationTracking, cancelGeneration, processStreamingChunk, } = await import(
      "./cancellation-manager"
    );

    const options = {
      chatId: "chat-cancel-test",
      parentMessageId: "msg-cancel-test",
      actorId: "actor-1",
      modelId: "test-model",
      provider: "test",
      prompt: "Test prompt",
      idempotencyKey: "key-cancel-capture",
      stream: true,
      repetitionDetection: {
        enabled: true,
        minChars: 10,
        maxSimilarity: 0.85,
        windowSize: 100,
        minRepetitions: 3,
        autoCancel: true,
      },
      policyDetection: {
        enabled: false,
        expectedPolicy: "sfw" as const,
        autoCancel: false,
        confidenceThreshold: 0.7,
      },
      responseLimit: { maxResponsesPerTurn: 1, isGroupChat: false, autoCancel: true, },
      stepIndex: 0,
      totalSteps: 1,
    };

    const { attemptId, } = await startGenerationTracking({ options, db: testDb, },);

    await processStreamingChunk({ attemptId, chunk: "Hello, this is a test response.", db: testDb, },);
    await processStreamingChunk({ attemptId, chunk: " Continuing with more content.", db: testDb, },);

    cancelGeneration({ attemptId, reason: "user_cancel", source: "user", detail: "Test cancel", },);

    const result = await getPartialContent(attemptId, testDb,);
    expect(result.content,).toBe("Hello, this is a test response. Continuing with more content.",);
  });
});
