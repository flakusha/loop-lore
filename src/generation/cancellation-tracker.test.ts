import { describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import { GenerationStatus, } from "../db/enums";
import type { DB, } from "../db/schema";
import { createLogger, getLogger, } from "../logger";
import {
  type ActiveGeneration,
  activeGenerations,
  chatToAttempt,
  getActiveAttemptId,
  IdempotencyKeyConflictError,
  isChatGenerating,
  listActiveGenerations,
  safeTransition,
  startGenerationTracking,
} from "./cancellation-tracker";
import type { GenerationOptions, } from "./types";

// Initialize logger
createLogger({ level: "error", },);

// Clear maps before each test
/** */
function clearState(): void {
  activeGenerations.clear();
  chatToAttempt.clear();
}

describe("isChatGenerating", () => {
  it("returns false when no active generations", () => {
    clearState();
    expect(isChatGenerating("chat-1",),).toBe(false,);
  });

  it("returns true when chat has active generation", () => {
    clearState();
    const attemptId = "attempt-1";
    activeGenerations.set(attemptId, {
      attemptId,
      chatId: "chat-1",
      status: GenerationStatus.Streaming,
    } as ActiveGeneration,);
    chatToAttempt.set("chat-1", attemptId,);
    expect(isChatGenerating("chat-1",),).toBe(true,);
  });

  it("returns false when chat's generation is completed", () => {
    clearState();
    const attemptId = "attempt-1";
    activeGenerations.set(attemptId, {
      attemptId,
      chatId: "chat-1",
      status: GenerationStatus.Completed,
    } as ActiveGeneration,);
    chatToAttempt.set("chat-1", attemptId,);
    expect(isChatGenerating("chat-1",),).toBe(false,);
  });
});

describe("getActiveAttemptId", () => {
  it("returns undefined when no active generation", () => {
    clearState();
    expect(getActiveAttemptId("chat-1",),).toBeUndefined();
  });

  it("returns attemptId for active chat", () => {
    clearState();
    chatToAttempt.set("chat-1", "attempt-1",);
    expect(getActiveAttemptId("chat-1",),).toBe("attempt-1",);
  });
});

describe("listActiveGenerations", () => {
  it("returns empty list when no active generations", () => {
    clearState();
    expect(listActiveGenerations(),).toEqual([],);
  });

  it("returns list of active generations", () => {
    clearState();
    activeGenerations.set("attempt-1", {
      attemptId: "attempt-1",
      chatId: "chat-1",
      actorId: "actor-1",
      status: GenerationStatus.Streaming,
      chunksReceived: 5,
      charsReceived: 100,
      startedAt: Date.now() - 1000,
    } as ActiveGeneration,);
    const list = listActiveGenerations();
    expect(list.length,).toBe(1,);
    expect(list[0]!.attemptId,).toBe("attempt-1",);
  });
});

describe("safeTransition", () => {
  it("applies valid transition", () => {
    const log = getLogger();
    const active = {
      attemptId: "attempt-1",
      status: GenerationStatus.Pending,
    } as ActiveGeneration;
    safeTransition({ active, to: GenerationStatus.Processing, log, },);
    expect(active.status,).toBe(GenerationStatus.Processing,);
  });

  it("applies invalid transition with warning (does not block)", () => {
    const log = getLogger();
    const active = {
      attemptId: "attempt-1",
      status: GenerationStatus.Completed,
    } as ActiveGeneration;
    // Invalid: Completed → Streaming
    safeTransition({ active, to: GenerationStatus.Streaming, log, },);
    expect(active.status,).toBe(GenerationStatus.Streaming,);
  });
});

describe("startGenerationTracking idempotency", () => {
  /** */
  function makeMockDb(): Kysely<DB> {
    const chain = {
      execute: async () => {},
      set: () => chain,
      values: () => chain,
      where: () => chain,
    };
    return {
      insertInto: () => chain,
      updateTable: () => chain,
    } as unknown as Kysely<DB>;
  }

  const baseOptions = {
    chatId: "chat-1",
    actorId: "actor-1",
    idempotencyKey: "key-1",
    modelId: "m",
    provider: "p",
  } as GenerationOptions;

  it("throws IdempotencyKeyConflictError on duplicate key (closes TOCTOU)", async () => {
    clearState();
    const db = makeMockDb();
    const first = await startGenerationTracking({ options: baseOptions, db, },);
    await expect(
      startGenerationTracking({ options: baseOptions, db, },),
    ).rejects.toThrow(IdempotencyKeyConflictError,);
    // First generation stays intact and in-flight.
    expect(isChatGenerating("chat-1",),).toBe(true,);
    expect(getActiveAttemptId("chat-1",),).toBe(first.attemptId,);
  });

  it("aborts previous generation on chat switch with different key", async () => {
    clearState();
    const db = makeMockDb();
    const first = await startGenerationTracking({ options: baseOptions, db, },);
    const second = await startGenerationTracking({
      options: { ...baseOptions, idempotencyKey: "key-2", },
      db,
    },);
    expect(first.abortSignal.aborted,).toBe(true,);
    expect(second.attemptId,).not.toBe(first.attemptId,);
    expect(getActiveAttemptId("chat-1",),).toBe(second.attemptId,);
  });
});
