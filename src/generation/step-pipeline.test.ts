/**
 * Tests for generation/step-pipeline.ts — step pipeline tracking
 */
import { Database, } from "bun:sqlite";
import { afterAll, afterEach, beforeAll, describe, expect, test, } from "bun:test";
import { Kysely, } from "kysely";
import { GenerationStatus, PolicyType, } from "../db/enums";
import { createSqliteDialect, } from "../db/index";
import { up as migrate, } from "../db/migrations/001_init";
import type { DB, } from "../db/schema";
import type { ActiveGeneration, } from "./cancellation-tracker";
import { activeGenerations, } from "./cancellation-tracker";
import { StreamingRepetitionDetector, } from "./repetition-detector";
import { completeStep, failStep, getPipelineState, } from "./step-pipeline";
import { DEFAULT_REPETITION_DETECTION, } from "./types";

/**
 * Minimal ActiveGeneration factory for test mocks.
 * @param overrides
 */
function makeActiveGen(overrides: Partial<ActiveGeneration>,): ActiveGeneration {
  const now = Date.now();
  return {
    attemptId: "test",
    chatId: "chat-test",
    parentMessageId: "msg-test",
    actorId: "actor-test",
    abortController: new AbortController(),
    startedAt: now,
    repetitionDetector: new StreamingRepetitionDetector(DEFAULT_REPETITION_DETECTION,),
    policyConfig: { expectedPolicy: PolicyType.Sfw, cancel: false, },
    responseLimitConfig: { maxResponses: 50, isGroupChat: false, currentCount: 0, },
    streaming: false,
    chunksReceived: 0,
    charsReceived: 0,
    status: GenerationStatus.Processing,
    lastRenderedChunkIndex: -1,
    deliveryConfirmed: false,
    sideEffectJobs: new Map(),
    stepIndex: 0,
    totalSteps: 1,
    ...overrides,
  };
}

describe("step-pipeline", () => {
  let db: Kysely<DB>;

  beforeAll(async () => {
    const sqlite = new Database(":memory:",);
    sqlite.run("PRAGMA foreign_keys = OFF",);
    db = new Kysely<DB>({ dialect: createSqliteDialect(sqlite,), },);
    await migrate(db as unknown as Kysely<unknown>,);

    await db
      .insertInto("generation_attempts",)
      .values({
        id: "attempt-persist",
        chat_id: "chat-1",
        parent_message_id: "msg-1",
        actor_id: "actor-1",
        idempotency_key: "ik-persist",
        model_id: "mock-model",
        provider: "mock",
        status: GenerationStatus.Processing,
        step_index: 0,
        total_steps: 3,
        started_at: new Date().toISOString(),
      },)
      .execute();
  },);

  afterEach(() => {
    activeGenerations.clear();
  },);

  afterAll(() => {
    activeGenerations.clear();
  },);

  describe("completeStep", () => {
    test("advances step index for active generation", async () => {
      activeGenerations.set("a1", makeActiveGen({ attemptId: "a1", stepIndex: 0, totalSteps: 3, },),);

      await completeStep({ attemptId: "a1", stepIndex: 0, db, },);
      expect(activeGenerations.get("a1",)!.stepIndex,).toBe(1,);
    });

    test("no-ops for unknown attempt", async () => {
      await expect(completeStep({ attemptId: "unknown", stepIndex: 0, db, },),).resolves.toBeUndefined();
    });
  });

  describe("failStep", () => {
    test("updates DB with failed status", async () => {
      const err = new Error("generation error",);
      await failStep({ attemptId: "attempt-persist", stepIndex: 2, error: err, db, },);

      // Verify DB update via direct query (in-memory map is empty)
      const row = await db
        .selectFrom("generation_attempts",)
        .select(["status", "error_message", "step_index",],)
        .where("id", "=", "attempt-persist",)
        .executeTakeFirst();

      expect(row!.status,).toBe(GenerationStatus.Failed,);
      expect(row!.error_message,).toContain("Step 2 failed",);
      expect(row!.step_index,).toBe(2,);
    });

    test("no-ops gracefully on unknown attempt", async () => {
      const err = new Error("test",);
      await expect(failStep({ attemptId: "unknown", stepIndex: 0, error: err, db, },),).resolves.toBeUndefined();
    });
  });

  describe("getPipelineState", () => {
    test("returns state from active in-memory generation", async () => {
      activeGenerations.set("a2", makeActiveGen({ attemptId: "a2", stepIndex: 2, totalSteps: 5, },),);

      const state = await getPipelineState("a2", db,);
      expect(state,).not.toBeNull();
      expect(state!.stepIndex,).toBe(2,);
      expect(state!.totalSteps,).toBe(5,);
      expect(state!.status,).toBe(GenerationStatus.Processing,);
    });

    test("falls back to DB when not in memory", async () => {
      // In-memory map is cleared (afterEach), so falls to DB
      const state = await getPipelineState("attempt-persist", db,);
      expect(state,).not.toBeNull();
      expect(state!.stepIndex,).toBe(2,); // updated by failStep
      expect(state!.totalSteps,).toBe(3,);
      expect(state!.status,).toBe(GenerationStatus.Failed,);
    });

    test("returns null for unknown attempt", async () => {
      const state = await getPipelineState("nonexistent", db,);
      expect(state,).toBeNull();
    });
  });
});
