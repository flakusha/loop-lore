import { describe, expect, it, } from "bun:test";
import { GenerationStatus, } from "../db/enums";
import { createLogger, getLogger, } from "../logger";
import {
  type ActiveGeneration,
  activeGenerations,
  chatToAttempt,
  getActiveAttemptId,
  isChatGenerating,
  listActiveGenerations,
  safeTransition,
} from "./cancellation-tracker";

// Initialize logger
createLogger({ level: "error", },);

// Clear maps before each test
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
