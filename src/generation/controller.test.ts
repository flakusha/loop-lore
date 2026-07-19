/**
 * Tests for generation controller (input validation and non-DB paths).
 */
import { describe, expect, test, } from "bun:test";
import {
  handleCancelGeneration,
  handleGenerationStatus,
  handleListActiveGenerations,
  handleRegenerate,
  handleRetryGeneration,
} from "./generation-routes";

/**
 * Tests for generation controller (input validation and non-DB paths).
 */

describe("handleCancelGeneration", () => {
  test("returns 400 when both chatId and attemptId missing", () => {
    const res = handleCancelGeneration({},);
    expect(res.status,).toBe(400,);
  });

  test("returns 404 when no active generation for chatId", () => {
    const res = handleCancelGeneration({ chatId: "nonexistent-chat", },);
    expect(res.status,).toBe(404,);
  });
});

describe("handleGenerationStatus", () => {
  test("returns 400 when chatId missing", () => {
    const res = handleGenerationStatus("",);
    expect(res.status,).toBe(400,);
  });

  test("returns inactive status for non-generating chat", async () => {
    const res = handleGenerationStatus("chat-1",);
    expect(res.status,).toBe(200,);
    const data = (await res.json()) as { isActive: boolean; attemptId: string | null; generation: unknown };
    expect(data.isActive,).toBe(false,);
    expect(data.attemptId,).toBeNull();
    expect(data.generation,).toBeNull();
  });
});

describe("handleListActiveGenerations", () => {
  test("returns list structure", async () => {
    const res = handleListActiveGenerations();
    expect(res.status,).toBe(200,);
    const data = (await res.json()) as { count: number; generations: unknown[] };
    expect(typeof data.count,).toBe("number",);
    expect(Array.isArray(data.generations,),).toBe(true,);
  });
});

describe("handleRetryGeneration", () => {
  test("returns 400 when chatId missing", async () => {
    const res = await handleRetryGeneration({},);
    expect(res.status,).toBe(400,);
  });

  test("returns retry response with defaults", async () => {
    const res = await handleRetryGeneration({ chatId: "chat-1", },);
    expect(res.status,).toBe(200,);
    const data = (await res.json()) as {
      ok: boolean;
      chatId: string;
      resumeFromStep: number;
      totalSteps: number;
    };
    expect(data.ok,).toBe(true,);
    expect(data.chatId,).toBe("chat-1",);
    expect(data.resumeFromStep,).toBe(0,);
    expect(data.totalSteps,).toBe(1,);
  });

  test("resumes from specified step when provided without attemptId", async () => {
    const res = await handleRetryGeneration({ chatId: "chat-1", step: 2, },);
    expect(res.status,).toBe(200,);
    const data = (await res.json()) as { resumeFromStep: number; totalSteps: number };
    expect(data.resumeFromStep,).toBe(2,);
    expect(data.totalSteps,).toBe(1,);
  });

  test("clamps negative step to 0", async () => {
    const res = await handleRetryGeneration({ chatId: "chat-1", step: -5, },);
    expect(res.status,).toBe(200,);
    const data = (await res.json()) as { resumeFromStep: number };
    expect(data.resumeFromStep,).toBe(0,);
  });
});

describe("handleRegenerate", () => {
  test("returns 400 when chatId missing", () => {
    const res = handleRegenerate({},);
    expect(res.status,).toBe(400,);
  });

  test("returns success with ready flag", async () => {
    const res = handleRegenerate({ chatId: "chat-1", },);
    expect(res.status,).toBe(200,);
    const data = (await res.json()) as { ok: boolean; chatId: string; ready: boolean };
    expect(data.ok,).toBe(true,);
    expect(data.chatId,).toBe("chat-1",);
    expect(data.ready,).toBe(true,);
  });
});
