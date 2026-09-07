// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for generation/step-pipeline.ts — multi-step pipeline tracking.
 *
 * The colocated step-pipeline.test.ts predates FK enforcement on
 * generation_attempts and fails at setup; this file mirrors the
 * continuation.test.ts convention (createTestDb + seeded parent rows).
 */
import { beforeAll, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import { GenerationStatus, PolicyType, } from "../db/enums";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import type { ActiveGeneration, } from "./cancellation-tracker";
import { activeGenerations, } from "./cancellation-tracker";
import { StreamingRepetitionDetector, } from "./repetition-detector";
import { completeStep, failStep, getPipelineState, } from "./step-pipeline";
import { DEFAULT_REPETITION_DETECTION, } from "./types";

let db: Kysely<DB>;

beforeAll(async () => {
  const created = await createTestDb();
  db = created.db;

  // Seed FK parents once.
  await db.insertInto("users",).values({
    id: "user-1",
    username: "test",
    display_name: "Test",
    role: "user",
    status: "active",
    settings: "{}",
  },).execute();
  await db.insertInto("chats",).values({
    id: "chat-1",
    name: "Test Chat",
    type: "direct",
    mode: "direct",
    created_by: "user-1",
  },).execute();
  await db.insertInto("actors",).values({
    id: "actor-1",
    actor_type: "character",
    display_name: "AI",
    agent_type: "ai",
    settings: "{}",
    format_version: 0,
    import_spec: "{}",
  },).execute();
  await db.insertInto("messages",).values({
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

  await db.insertInto("generation_attempts",).values({
    id: "attempt-persist",
    chat_id: "chat-1",
    parent_message_id: "msg-1",
    actor_id: "actor-1",
    idempotency_key: "ik-persist",
    model_id: "test-model",
    provider: "test",
    status: GenerationStatus.Processing,
    step_index: 0,
    total_steps: 3,
  },).execute();
  await db.insertInto("generation_attempts",).values({
    id: "attempt-db",
    chat_id: "chat-1",
    parent_message_id: "msg-1",
    actor_id: "actor-1",
    idempotency_key: "ik-db",
    model_id: "test-model",
    provider: "test",
    status: GenerationStatus.Failed,
    step_index: 2,
    total_steps: 5,
  },).execute();
  // Damaged/legacy row: NULL step_index and total_steps.
  await db.insertInto("generation_attempts",).values({
    id: "attempt-nulls",
    chat_id: "chat-1",
    parent_message_id: "msg-1",
    actor_id: "actor-1",
    idempotency_key: "ik-nulls",
    model_id: "test-model",
    provider: "test",
    status: GenerationStatus.Processing,
    step_index: null,
    total_steps: null,
  },).execute();
},);

/** Minimal typed ActiveGeneration factory (mirrors step-pipeline.test.ts). */
function makeActiveGen(overrides: Partial<ActiveGeneration>,): ActiveGeneration {
  return {
    attemptId: "test",
    chatId: "chat-test",
    parentMessageId: "msg-test",
    actorId: "actor-test",
    abortController: new AbortController(),
    startedAt: Date.now(),
    repetitionDetector: new StreamingRepetitionDetector(DEFAULT_REPETITION_DETECTION,),
    policyConfig: { expectedPolicy: PolicyType.Sfw, cancel: false, },
    responseLimitConfig: { maxResponses: 50, isGroupChat: false, currentCount: 0, },
    streaming: false,
    chunksReceived: 0,
    charsReceived: 0,
    status: GenerationStatus.Processing,
    lastRenderedChunkIndex: -1,
    deliveryConfirmed: false,
    stepIndex: 0,
    totalSteps: 1,
    ...overrides,
  };
}

/** Read one attempt row's pipeline columns back from the DB. */
async function attemptRow(id: string,): Promise<
  {
    status: string;
    error_message: string | null;
    step_index: number | null;
  } | undefined
> {
  return db
    .selectFrom("generation_attempts",)
    .select(["status", "error_message", "step_index",],)
    .where("id", "=", id,)
    .executeTakeFirst();
}

describe("completeStep", () => {
  it("advances the in-memory step index and persists it", async () => {
    activeGenerations.set("att-cs", makeActiveGen({ attemptId: "att-cs", stepIndex: 0, totalSteps: 3, },),);

    await completeStep({ attemptId: "att-cs", stepIndex: 0, db, },);
    expect(activeGenerations.get("att-cs",)?.stepIndex,).toBe(1,);

    const row = await attemptRow("att-cs-db-missing",);
    expect(row,).toBeUndefined();
  });

  it("writes the advanced step index to the attempt row", async () => {
    activeGenerations.set(
      "attempt-persist",
      makeActiveGen({ attemptId: "attempt-persist", stepIndex: 0, totalSteps: 3, },),
    );

    await completeStep({ attemptId: "attempt-persist", stepIndex: 1, db, },);

    const row = await attemptRow("attempt-persist",);
    expect(row?.step_index,).toBe(2,);
    expect(row?.status,).toBe(GenerationStatus.Processing,);
  });

  it("no-ops for an unknown attempt", async () => {
    await expect(completeStep({ attemptId: "unknown-cs", stepIndex: 0, db, },),)
      .resolves.toBeUndefined();
  });

  it("swallows and logs DB failures while keeping the in-memory advance", async () => {
    activeGenerations.set("att-cs-err", makeActiveGen({ attemptId: "att-cs-err", stepIndex: 2, },),);
    const brokenDb = {
      updateTable: () => {
        throw new Error("db down",);
      },
    } as unknown as Kysely<DB>;

    await expect(completeStep({ attemptId: "att-cs-err", stepIndex: 2, db: brokenDb, },),)
      .resolves.toBeUndefined();
    expect(activeGenerations.get("att-cs-err",)?.stepIndex,).toBe(3,);
  });
});

describe("failStep", () => {
  it("persists the failed status with step context", async () => {
    await failStep({
      attemptId: "attempt-persist",
      stepIndex: 2,
      error: new Error("generation exploded",),
      db,
    },);

    const row = await attemptRow("attempt-persist",);
    expect(row?.status,).toBe(GenerationStatus.Failed,);
    expect(row?.error_message,).toContain("Step 2 failed",);
    expect(row?.error_message,).toContain("generation exploded",);
    expect(row?.step_index,).toBe(2,);
  });

  it("resolves even when the attempt row does not exist", async () => {
    await expect(failStep({
      attemptId: "unknown-fs",
      stepIndex: 0,
      error: new Error("x",),
      db,
    },),).resolves.toBeUndefined();
  });

  it("swallows DB failures", async () => {
    const brokenDb = {
      updateTable: () => {
        throw new Error("db down",);
      },
    } as unknown as Kysely<DB>;

    await expect(failStep({
      attemptId: "attempt-persist",
      stepIndex: 1,
      error: new Error("y",),
      db: brokenDb,
    },),).resolves.toBeUndefined();
  });
});

describe("getPipelineState", () => {
  it("prefers the in-memory record", async () => {
    activeGenerations.set(
      "att-mem",
      makeActiveGen({
        attemptId: "att-mem",
        stepIndex: 2,
        totalSteps: 7,
        status: GenerationStatus.Streaming,
      },),
    );

    const state = await getPipelineState("att-mem", db,);
    expect(state,).toEqual({
      stepIndex: 2,
      totalSteps: 7,
      status: GenerationStatus.Streaming,
    },);
  });

  it("falls back to the DB row when not in memory", async () => {
    const state = await getPipelineState("attempt-db", db,);
    expect(state,).toEqual({
      stepIndex: 2,
      totalSteps: 5,
      status: GenerationStatus.Failed,
    },);
  });

  it("defaults NULL step columns for damaged rows", async () => {
    const state = await getPipelineState("attempt-nulls", db,);
    expect(state,).toEqual({
      stepIndex: 0,
      totalSteps: 1,
      status: GenerationStatus.Processing,
    },);
  });

  it("returns null for an unknown attempt", async () => {
    expect(await getPipelineState("no-such-attempt", db,),).toBeNull();
  });
});
