import { describe, expect, it, } from "bun:test";
import { CancelReason, CancelSource, GenerationStatus, } from "../db/enums";
import { createLogger, } from "../logger";
import {
  cancelGeneration,
  cancelGenerationByChat,
  GenerationCancelledError,
  getAbortSignal,
} from "./cancellation-actions";
import {
  type ActiveGeneration,
  activeGenerations,
  chatToAttempt,
} from "./cancellation-tracker";

// Initialize logger
createLogger({ level: "error", },);

// Clear state before tests
/** */
function clearState(): void {
  activeGenerations.clear();
  chatToAttempt.clear();
}

describe("cancelGeneration", () => {
  it("returns false when attempt not found", () => {
    clearState();
    const result = cancelGeneration({
      attemptId: "nonexistent",
      reason: CancelReason.UserCancel,
      source: CancelSource.User,
      detail: "test",
    },);
    expect(result,).toBe(false,);
  });

  it("returns true and aborts when attempt found", () => {
    clearState();
    const controller = new AbortController();
    activeGenerations.set("attempt-1", {
      attemptId: "attempt-1",
      chatId: "chat-1",
      status: GenerationStatus.Streaming,
      abortController: controller,
      repetitionDetector: { getBufferText: () => "", },
    } as unknown as ActiveGeneration,);
    chatToAttempt.set("chat-1", "attempt-1",);

    const result = cancelGeneration({
      attemptId: "attempt-1",
      reason: CancelReason.UserCancel,
      source: CancelSource.User,
      detail: "test cancel",
    },);
    expect(result,).toBe(true,);
    expect(controller.signal.aborted,).toBe(true,);
    expect(activeGenerations.has("attempt-1",),).toBe(false,);
    expect(chatToAttempt.has("chat-1",),).toBe(false,);
  });

  it("sets status to Cancelled", () => {
    clearState();
    const controller = new AbortController();
    const active = {
      attemptId: "attempt-2",
      chatId: "chat-2",
      status: GenerationStatus.Streaming,
      abortController: controller,
      repetitionDetector: { getBufferText: () => "", },
    } as unknown as ActiveGeneration;
    activeGenerations.set("attempt-2", active,);

    cancelGeneration({
      attemptId: "attempt-2",
      reason: CancelReason.UserCancel,
      source: CancelSource.User,
      detail: "test",
    },);
    expect(active.status,).toBe(GenerationStatus.Cancelled,);
  });
});

describe("cancelGenerationByChat", () => {
  it("returns false when no active generation for chat", () => {
    clearState();
    // Need a db parameter but it won't be used since there's no match
    const mockDb = {} as any;
    const result = cancelGenerationByChat({
      db: mockDb,
      chatId: "chat-1",
    },);
    expect(result,).toBe(false,);
  });

  it("cancels generation for the specified chat", () => {
    clearState();
    const controller = new AbortController();
    activeGenerations.set("attempt-1", {
      attemptId: "attempt-1",
      chatId: "chat-1",
      status: GenerationStatus.Streaming,
      abortController: controller,
      repetitionDetector: { getBufferText: () => "", },
    } as unknown as ActiveGeneration,);
    chatToAttempt.set("chat-1", "attempt-1",);

    const mockDb = {
      updateTable: () => ({
        set: () => ({
          where: () => ({
            execute: () => Promise.resolve(),
          }),
        }),
      }),
    } as any;
    const result = cancelGenerationByChat({
      db: mockDb,
      chatId: "chat-1",
    },);
    expect(result,).toBe(true,);
    expect(controller.signal.aborted,).toBe(true,);
    expect(activeGenerations.has("attempt-1",),).toBe(false,);
  });
});

describe("getAbortSignal", () => {
  it("returns null for unknown attempt", () => {
    clearState();
    expect(getAbortSignal("nonexistent",),).toBeNull();
  });

  it("returns signal for active attempt", () => {
    clearState();
    const controller = new AbortController();
    activeGenerations.set("attempt-1", {
      attemptId: "attempt-1",
      abortController: controller,
    } as ActiveGeneration,);
    const signal = getAbortSignal("attempt-1",);
    expect(signal,).toBe(controller.signal,);
  });
});

describe("GenerationCancelledError", () => {
  it("is an instance of Error with correct properties", () => {
    const err = new GenerationCancelledError(
      CancelReason.UserCancel,
      CancelSource.User,
      "test detail",
    );
    expect(err,).toBeInstanceOf(Error,);
    expect(err.name,).toBe("GenerationCancelledError",);
    expect(err.reason,).toBe(CancelReason.UserCancel,);
    expect(err.source,).toBe(CancelSource.User,);
    expect(err.detail,).toBe("test detail",);
    expect(err.message,).toContain("user_cancel",);
  });
});
