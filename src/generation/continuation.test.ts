import { describe, test, expect, beforeEach, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { Kysely, SqliteDialect } from "kysely";
import type { DB } from "../db/schema";
import {
  getPartialContent,
  storePartialContent,
  clearPartialContent,
  mapMessageToAttempt,
  getAttemptForMessage,
} from "./continuation";
import { handleContinueGeneration, handleRetryGeneration } from "./generation-routes";
import { setTestDatabase } from "../db/index";

// ── SQLite wrapper (matches BunSqliteWrapper in db/index.ts) ─

interface BunSqliteStatement {
  reader: boolean;
  all(parameters: readonly unknown[]): unknown[];
  run(parameters: readonly unknown[]): { changes: number | bigint; lastInsertRowid: number | bigint };
  iterate(parameters: readonly unknown[]): IterableIterator<unknown>;
}

interface BunSqliteWrapper {
  close(): void;
  prepare(sql: string): BunSqliteStatement;
}

// ── Helpers ─────────────────────────────────────────────────

function createTestDb(): { sqlite: Database; db: Kysely<DB> } {
  const sqlite = new Database(":memory:");
  sqlite.run("PRAGMA foreign_keys = ON");

  const wrapped: BunSqliteWrapper = {
    close() {
      sqlite.close();
    },
    prepare: (sql: string) => {
      const statement = sqlite.prepare(sql);
      return {
        get reader() {
          const s = sql.trim().toUpperCase();
          return s.startsWith("SELECT") || s.startsWith("WITH") || s.startsWith("PRAGMA");
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        all: (parameters: readonly unknown[]) => statement.all(...(parameters as any[])),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        run: (parameters: readonly unknown[]) => statement.run(...(parameters as any[])),
        iterate: function* (parameters: readonly unknown[]) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          yield* statement.all(...(parameters as any[]));
        },
      };
    },
  };

  const dialect = new SqliteDialect({ database: wrapped });
  const db = new Kysely<DB>({ dialect }) as unknown as Kysely<DB>;

  // Create schema tables
  sqlite.run(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      settings TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  sqlite.run(`
    CREATE TABLE chats (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'direct',
      mode TEXT NOT NULL DEFAULT 'direct',
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  sqlite.run(`
    CREATE TABLE actors (
      id TEXT PRIMARY KEY,
      actor_type TEXT NOT NULL DEFAULT 'user',
      display_name TEXT NOT NULL,
      agent_type TEXT NOT NULL DEFAULT 'none',
      settings TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  sqlite.run(`
    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      content_type TEXT NOT NULL DEFAULT 'text',
      content_encoding TEXT NOT NULL DEFAULT 'identity',
      status TEXT NOT NULL DEFAULT 'sent',
      visibility TEXT NOT NULL DEFAULT 'visible',
      is_continuation INTEGER NOT NULL DEFAULT 0,
      continuation_index INTEGER,
      partial INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  sqlite.run(`
    CREATE TABLE generation_attempts (
      id TEXT PRIMARY KEY,
      chat_id TEXT NOT NULL,
      parent_message_id TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      model_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      cancel_reason TEXT,
      cancel_reason_detail TEXT,
      cancel_source TEXT,
      abort_signal_id TEXT,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      prompt_tokens INTEGER,
      completion_tokens INTEGER,
      total_tokens INTEGER,
      generation_time_ms INTEGER,
      error_message TEXT,
      streaming_chunks_received INTEGER,
      streaming_chars_received INTEGER,
      repetition_score REAL,
      repetition_analysis TEXT,
      policy_analysis TEXT,
      response_count_in_turn INTEGER,
      parent_attempt_id TEXT,
      continuation_count INTEGER DEFAULT 0,
      partial_content TEXT,
      step_index INTEGER DEFAULT 0,
      total_steps INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  return { sqlite, db };
}

let testSqlite: Database;
const testEnv = createTestDb();
testSqlite = testEnv.sqlite;
const testDb = testEnv.db;

/** Clean all test tables between tests */
async function cleanTables(): Promise<void> {
  await testDb.deleteFrom("generation_attempts").execute();
  await testDb.deleteFrom("messages").execute();
  await testDb.deleteFrom("actors").execute();
  await testDb.deleteFrom("chats").execute();
  await testDb.deleteFrom("users").execute();
}

beforeEach(async () => {
  clearPartialContent();
  setTestDatabase(testDb);
  await cleanTables();
});

afterAll(() => {
  setTestDatabase(null);
  testSqlite.close();
});

// ── Continuation module: in-memory tests ────────────────────

describe("storePartialContent / getPartialContent (in-memory)", () => {
  test("stores and retrieves partial content", async () => {
    storePartialContent("attempt-1", "Hello, this is partial");
    const result = await getPartialContent("attempt-1", testDb);
    expect(result.content).toBe("Hello, this is partial");
  });

  test("returns null for unknown attempt", async () => {
    const result = await getPartialContent("nonexistent", testDb);
    expect(result.content).toBeNull();
  });

  test("overwrites existing content", async () => {
    storePartialContent("attempt-1", "Old content");
    storePartialContent("attempt-1", "New content");
    const result = await getPartialContent("attempt-1", testDb);
    expect(result.content).toBe("New content");
  });

  test("clearPartialContent removes all stored content", async () => {
    storePartialContent("attempt-1", "Some content");
    clearPartialContent();
    const result = await getPartialContent("attempt-1", testDb);
    expect(result.content).toBeNull();
  });
});

describe("getPartialContent — DB fallback", () => {
  beforeEach(async () => {
    await testDb
      .insertInto("generation_attempts")
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
      })
      .execute();
  });

  test("falls back to DB when not in memory", async () => {
    const result = await getPartialContent("db-attempt-1", testDb);
    expect(result.content).toBe("DB stored partial content");
  });

  test("in-memory takes precedence over DB", async () => {
    storePartialContent("db-attempt-1", "Memory override");
    const result = await getPartialContent("db-attempt-1", testDb);
    expect(result.content).toBe("Memory override");
  });

  test("returns null for attempt with null partial_content", async () => {
    await testDb
      .insertInto("generation_attempts")
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
      })
      .execute();
    const result = await getPartialContent("db-attempt-2", testDb);
    expect(result.content).toBeNull();
  });
});

describe("mapMessageToAttempt / getAttemptForMessage", () => {
  test("maps message to attempt and retrieves", () => {
    mapMessageToAttempt("msg-1", "attempt-1");
    expect(getAttemptForMessage("msg-1")).toBe("attempt-1");
  });

  test("returns undefined for unmapped message", () => {
    expect(getAttemptForMessage("unknown-msg")).toBeUndefined();
  });

  test("overwrites existing mapping", () => {
    mapMessageToAttempt("msg-1", "attempt-1");
    mapMessageToAttempt("msg-1", "attempt-2");
    expect(getAttemptForMessage("msg-1")).toBe("attempt-2");
  });

  test("clearPartialContent clears mappings", () => {
    mapMessageToAttempt("msg-1", "attempt-1");
    clearPartialContent();
    expect(getAttemptForMessage("msg-1")).toBeUndefined();
  });
});

// ── Controller: handleContinueGeneration ─────────────────────

describe("handleContinueGeneration", () => {
  beforeEach(async () => {
    await testDb
      .insertInto("users")
      .values({ id: "user-1", username: "test", display_name: "Test", role: "user", settings: "{}" })
      .execute();

    await testDb
      .insertInto("chats")
      .values({ id: "chat-1", name: "Test Chat", type: "direct", mode: "direct", created_by: "user-1" })
      .execute();

    await testDb
      .insertInto("actors")
      .values({ id: "actor-1", actor_type: "character", display_name: "AI", agent_type: "ai", settings: "{}" })
      .execute();

    await testDb
      .insertInto("messages")
      .values({
        id: "msg-1",
        chat_id: "chat-1",
        actor_id: "actor-1",
        role: "assistant",
        content: "Partial response...",
        content_type: "text",
        content_encoding: "identity",
        status: "sent",
        visibility: "visible",
        partial: 1,
      })
      .execute();
  });

  test("returns 400 when messageId missing", async () => {
    const body = { chatId: "chat-1", actorId: "actor-1" };
    const response = await handleContinueGeneration(body);
    const data = (await response.json()) as Record<string, unknown>;
    expect(response.status).toBe(400);
    expect(data.error).toContain("messageId");
  });

  test("returns 404 when no cancelled/failed attempt exists", async () => {
    const body = { messageId: "msg-nonexistent", chatId: "chat-1", actorId: "actor-1" };
    const response = await handleContinueGeneration(body);
    expect(response.status).toBe(404);
  });

  test("returns 422 when partial content not available", async () => {
    await testDb
      .insertInto("generation_attempts")
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
      })
      .execute();

    const body = { messageId: "msg-1", chatId: "chat-1", actorId: "actor-1" };
    const response = await handleContinueGeneration(body);
    expect(response.status).toBe(422);
  });

  test("returns continue response with metadata on success", async () => {
    storePartialContent("attempt-cont-1", "Partial response so far...");

    await testDb
      .insertInto("generation_attempts")
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
      })
      .execute();

    const body = { messageId: "msg-1", chatId: "chat-1", actorId: "actor-1" };
    const response = await handleContinueGeneration(body);
    const data = (await response.json()) as Record<string, unknown>;

    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.parentAttemptId).toBe("attempt-cont-1");
    expect(data.partialContent).toBe("Partial response so far...");
    expect(data.chatId).toBe("chat-1");
    expect(data.messageId).toBe("msg-1");
    expect(data.actorId).toBe("actor-1");
    expect(data.modelId).toBe("test-model");
    expect(data.continueContext).toBeDefined();
    expect((data.continueContext as Record<string, unknown>).parentAttemptId).toBe("attempt-cont-1");
  });

  test("increments continuationNumber with existing continuations", async () => {
    storePartialContent("attempt-parent", "Parent partial content");

    await testDb
      .insertInto("generation_attempts")
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
      })
      .execute();

    await testDb
      .insertInto("generation_attempts")
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
      })
      .execute();

    const body = { messageId: "msg-1", chatId: "chat-1", actorId: "actor-1" };
    const response = await handleContinueGeneration(body);
    const data = (await response.json()) as Record<string, unknown>;

    expect(data.continuationNumber).toBe(2);
  });
});

// ── Controller: handleRetryGeneration ───────────────────────

describe("handleRetryGeneration", () => {
  beforeEach(async () => {
    await testDb
      .insertInto("users")
      .values({ id: "user-1", username: "test", display_name: "Test", role: "user", settings: "{}" })
      .execute();

    await testDb
      .insertInto("chats")
      .values({ id: "chat-1", name: "Test Chat", type: "direct", mode: "direct", created_by: "user-1" })
      .execute();

    await testDb
      .insertInto("actors")
      .values({ id: "actor-1", actor_type: "character", display_name: "AI", agent_type: "ai", settings: "{}" })
      .execute();
  });

  test("returns 400 when chatId missing", async () => {
    const body = { attemptId: "some-attempt" };
    const response = await handleRetryGeneration(body);
    const data = (await response.json()) as Record<string, unknown>;
    expect(response.status).toBe(400);
    expect(data.error).toContain("chatId");
  });

  test("returns retry response with defaults when no step specified", async () => {
    const body = { chatId: "chat-1" };
    const response = await handleRetryGeneration(body);
    const data = (await response.json()) as Record<string, unknown>;
    expect(response.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.chatId).toBe("chat-1");
    expect(data.resumeFromStep).toBe(0);
    expect(data.totalSteps).toBe(1);
  });

  test("returns 404 when attempt not found with specific attemptId", async () => {
    const body = { chatId: "chat-1", attemptId: "nonexistent-attempt", step: 0 };
    const response = await handleRetryGeneration(body);
    expect(response.status).toBe(404);
  });

  test("resumes from specified step when attempt exists", async () => {
    await testDb
      .insertInto("generation_attempts")
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
      })
      .execute();

    const body = { chatId: "chat-1", attemptId: "attempt-step-2", step: 2 };
    const response = await handleRetryGeneration(body);
    const data = (await response.json()) as Record<string, unknown>;
    expect(response.status).toBe(200);
    expect(data.resumeFromStep).toBe(2);
    expect(data.totalSteps).toBe(5);
  });

  test("caps step at total_steps - 1", async () => {
    await testDb
      .insertInto("generation_attempts")
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
      })
      .execute();

    const body = { chatId: "chat-1", attemptId: "attempt-step-cap", step: 10 };
    const response = await handleRetryGeneration(body);
    const data = (await response.json()) as Record<string, unknown>;
    expect(data.resumeFromStep).toBe(2);
  });

  test("step without attemptId uses step as-is", async () => {
    const body = { chatId: "chat-1", step: 3 };
    const response = await handleRetryGeneration(body);
    const data = (await response.json()) as Record<string, unknown>;
    expect(data.resumeFromStep).toBe(3);
    expect(data.totalSteps).toBe(1);
  });

  test("negative step is clamped to 0", async () => {
    const body = { chatId: "chat-1", step: -5 };
    const response = await handleRetryGeneration(body);
    const data = (await response.json()) as Record<string, unknown>;
    expect(data.resumeFromStep).toBe(0);
  });
});

// ── Integration: cancel → partial content capture ──────────

describe("cancelGeneration captures partial content", () => {
  test("partial content from repetition detector is stored on cancel", async () => {
    const { startGenerationTracking, cancelGeneration, processStreamingChunk } = await import(
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
      responseLimit: { maxResponsesPerTurn: 1, isGroupChat: false, autoCancel: true },
      stepIndex: 0,
      totalSteps: 1,
    };

    const { attemptId } = startGenerationTracking(options, testDb);

    await processStreamingChunk(attemptId, "Hello, this is a test response.", testDb);
    await processStreamingChunk(attemptId, " Continuing with more content.", testDb);

    cancelGeneration(attemptId, "user_cancel", "user", "Test cancel");

    const result = await getPartialContent(attemptId, testDb);
    expect(result.content).toBe("Hello, this is a test response. Continuing with more content.");
  });
});
