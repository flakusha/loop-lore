/**
 * Tests for generation/step-pipeline.ts — step pipeline tracking
 */

import { describe, test, expect, beforeAll, afterEach, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { Kysely } from "kysely";
import { createSqliteDialect } from "../db/index";
import { completeStep, failStep, getPipelineState } from "./step-pipeline";
import { activeGenerations } from "./cancellation-tracker";
import { up as migrate } from "../db/migrations/001_init";
import type { DB } from "../db/schema";
import { GenerationStatus } from "../db/enums";

describe("step-pipeline", () => {
  let db: Kysely<DB>;

  beforeAll(async () => {
    const sqlite = new Database(":memory:");
    sqlite.run("PRAGMA foreign_keys = OFF");
    db = new Kysely<DB>({ dialect: createSqliteDialect(sqlite) });
    await migrate(db as unknown as Kysely<unknown>);

    await db
      .insertInto("generation_attempts")
      .values({
        id: "attempt-persist",
        chat_id: "chat-1",
        parent_message_id: "msg-1",
        actor_id: "actor-1",
        idempotency_key: "ik-persist",
        model_id: "mock-model",
        provider: "mock",
        status: GenerationStatus.InProgress,
        step_index: 0,
        total_steps: 3,
        started_at: new Date().toISOString(),
      })
      .execute();
  });

  afterEach(() => {
    activeGenerations.clear();
  });

  afterAll(() => {
    activeGenerations.clear();
  });

  describe("completeStep", () => {
    test("advances step index for active generation", async () => {
      activeGenerations.set("a1", {
        attemptId: "a1",
        stepIndex: 0,
        totalSteps: 3,
        status: GenerationStatus.InProgress,
        progress: 0,
        lastActivity: Date.now(),
        tokenCount: 0,
      });

      await completeStep("a1", 0, db);
      expect(activeGenerations.get("a1")!.stepIndex).toBe(1);
    });

    test("no-ops for unknown attempt", async () => {
      await expect(completeStep("unknown", 0, db)).resolves.toBeUndefined();
    });
  });

  describe("failStep", () => {
    test("updates DB with failed status", async () => {
      const err = new Error("generation error");
      await failStep("attempt-persist", 2, err, db);

      // Verify DB update via direct query (in-memory map is empty)
      const row = await db
        .selectFrom("generation_attempts")
        .select(["status", "error_message", "step_index"])
        .where("id", "=", "attempt-persist")
        .executeTakeFirst();

      expect(row!.status).toBe(GenerationStatus.Failed);
      expect(row!.error_message).toContain("Step 2 failed");
      expect(row!.step_index).toBe(2);
    });

    test("no-ops gracefully on unknown attempt", async () => {
      const err = new Error("test");
      await expect(failStep("unknown", 0, err, db)).resolves.toBeUndefined();
    });
  });

  describe("getPipelineState", () => {
    test("returns state from active in-memory generation", async () => {
      activeGenerations.set("a2", {
        attemptId: "a2",
        stepIndex: 2,
        totalSteps: 5,
        status: GenerationStatus.InProgress,
        progress: 0.4,
        lastActivity: Date.now(),
        tokenCount: 50,
      });

      const state = await getPipelineState("a2", db);
      expect(state).not.toBeNull();
      expect(state!.stepIndex).toBe(2);
      expect(state!.totalSteps).toBe(5);
      expect(state!.status).toBe(GenerationStatus.InProgress);
    });

    test("falls back to DB when not in memory", async () => {
      // In-memory map is cleared (afterEach), so falls to DB
      const state = await getPipelineState("attempt-persist", db);
      expect(state).not.toBeNull();
      expect(state!.stepIndex).toBe(2); // updated by failStep
      expect(state!.totalSteps).toBe(3);
      expect(state!.status).toBe(GenerationStatus.Failed);
    });

    test("returns null for unknown attempt", async () => {
      const state = await getPipelineState("nonexistent", db);
      expect(state).toBeNull();
    });
  });
});
