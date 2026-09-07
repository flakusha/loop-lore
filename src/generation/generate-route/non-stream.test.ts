// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the generation.completed telemetry latencyMs fix.
 *
 * Verifies that the non-streaming generation path records a real elapsed
 * latencyMs (not the old hardcoded 0).
 */
import { expect, it, mock, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../../test-utils/isolate-only";

// Telemetry calls are fire-and-forget (void record(...)).
// To capture them we spy on the module's `record` export.
const recordedEvents: { eventType: string; data: Record<string, unknown> }[] = [];

// Stub the telemetry service before importing the module under test.
if (ISOLATED) {
  mock.module("../../telemetry/service", () => ({
    record: async (...args: unknown[]) => {
      const params = args[1] as { eventType: string; data: Record<string, unknown> };
      recordedEvents.push(params,);
    },
    isTelemetryEnabled: () => true,
  }),);
}

// Stub extractAndStoreMemories — it's a background side-effect, not under test.
if (ISOLATED) {
  mock.module("../../memory", () => ({
    extractAndStoreMemories: async () => {},
  }),);
}

// Stub failGeneration + activeGenerations — non-stream.ts imports both from
// the cancellation-manager barrel (stop-and-respond records the last-rendered
// chunk index); an incomplete mock throws "Export named not found" at import.
if (ISOLATED) {
  mock.module("../cancellation-manager", () => ({
    failGeneration: async () => {},
    activeGenerations: new Map(),
  }),);
}

// Stub persist helpers — DB writes are not under test.
if (ISOLATED) {
  mock.module("./persist", () => ({
    buildGenerationResult: () => ({
      content: "test response",
      thinking: null,
      tokenUsage: { promptTokens: 10, completionTokens: 5, totalTokens: 15, },
      finishReason: "stop",
    }),
    storeGenerationResult: async () => "msg-id-1",
  }),);
}

// Stub tool-execution — not exercised in the no-tool-call path.
if (ISOLATED) {
  mock.module("./tool-execution", () => ({
    executeToolCalls: async () => [],
    MAX_TOOL_ROUNDS: 3,
  }),);
}

// Stub callWithFailover — we control the provider response.
let callDelayMs = 0;
const fakeResponse = {
  content: '{"ok":true}',
  finishReason: "stop" as const,
  usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15, },
  toolCalls: null,
};

if (ISOLATED) {
  mock.module("../providers/call-with-failover", () => ({
    callWithFailover: async () => {
      if (callDelayMs > 0) {
        await new Promise<void>(r => setTimeout(r, callDelayMs,));
      }
      return fakeResponse;
    },
  }),);
}

// Now import the function under test (after all mocks are in place).
const { runNonStreaming, } = await import("./non-stream");

const mockConfig = {
  generation: { defaultProvider: "p", defaultModels: {}, },
  templates: { llm: {}, },
} as unknown as import("../../config/schema").Config;

const mockInput = {
  actorId: "actor-1",
  chatId: "chat-1",
  parentMessageId: null,
} as unknown as import("./types").GenerateRequest;

describeOrSkip("runNonStreaming — generation.completed latencyMs", () => {
  it("records a non-zero latencyMs in the telemetry event", async () => {
    recordedEvents.length = 0;
    callDelayMs = 5; // 5ms simulated provider delay

    const { createTestDb, } = await import("../../test-utils/create-test-db");
    const { db, sqlite, } = await createTestDb();

    await runNonStreaming({
      input: mockInput,
      database: db,
      messages: [{ role: "user", content: "hello", },],
      cfg: mockConfig,
      userId: "user-1",
      attemptId: "attempt-1",
      modelId: "test-model",
      providerName: "test-provider",
      providerReq: { model: "test-model", messages: [], params: {}, },
      failoverList: [{ name: "test-provider", provider: {} as never, },],
    },);

    // record() is fire-and-forget; give it a tick to resolve.
    await new Promise<void>(r => setTimeout(r, 10,));

    const genEvent = recordedEvents.find(e => e.eventType === "generation.completed");
    expect(genEvent,).toBeDefined();
    expect(genEvent!.data.latencyMs,).toBeGreaterThan(0,);
    expect(genEvent!.data.promptTokens,).toBe(10,);
    expect(genEvent!.data.completionTokens,).toBe(5,);
    expect(genEvent!.data.model,).toBe("test-model",);
    expect(genEvent!.data.provider,).toBe("test-provider",);

    sqlite.close();
  });
},);
