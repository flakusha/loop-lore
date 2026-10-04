// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the generation.completed telemetry latencyMs fix.
 *
 * Verifies that the non-streaming generation path records a real elapsed
 * latencyMs (not the old hardcoded 0).
 */
import { afterEach, describe, expect, it, mock, } from "bun:test";
import { describeOrSkipStrict, STRICTLY_ISOLATED, } from "../../test-utils/isolate-only";
import type { GenerationMessage, } from "../types";

// Telemetry calls are fire-and-forget (void record(...)).
// To capture them we spy on the module's `record` export.
const recordedEvents: { eventType: string; data: Record<string, unknown> }[] = [];

// Swallow/reject flags — all default to the historical resolve-cleanly
// behavior so the pre-existing tests keep their original semantics.
let telemetryEnabled = true;
let telemetryReject = false;
let memoryReject = false;
let failThrows = false;
let failoverThrows = false;
let toolResults: GenerationMessage[] = [];
const failCalls: unknown[][] = [];
const callMessages: unknown[][] = [];
let responseQueue: unknown[] = [];
const activeMap = new Map<string, { lastRenderedChunkIndex: number; deliveryConfirmed: boolean }>();

afterEach(() => {
  telemetryEnabled = true;
  telemetryReject = false;
  memoryReject = false;
  failThrows = false;
  failoverThrows = false;
  toolResults = [];
  failCalls.length = 0;
  callMessages.length = 0;
  responseQueue = [];
  activeMap.clear();
},);

// Stub the telemetry service before importing the module under test.
if (STRICTLY_ISOLATED) {
  mock.module("../../telemetry/service", () => ({
    record: async (...args: unknown[]) => {
      if (telemetryReject) { throw new Error("telemetry down",); }
      const params = args[1] as { eventType: string; data: Record<string, unknown> };
      recordedEvents.push(params,);
    },
    isTelemetryEnabled: () => telemetryEnabled,
  }),);
}

// Stub extractAndStoreMemories — it's a background side-effect, not under test.
if (STRICTLY_ISOLATED) {
  mock.module("../../memory", () => ({
    extractAndStoreMemories: async () => {
      if (memoryReject) { throw new Error("memory down",); }
    },
  }),);
}

// Stub failGeneration + activeGenerations — non-stream.ts imports both from
// the cancellation-manager barrel (stop-and-respond records the last-rendered
// chunk index); an incomplete mock throws "Export named not found" at import.
// The activeMap instance is captured so tests can seed and inspect entries.
if (STRICTLY_ISOLATED) {
  mock.module("../cancellation-manager", () => ({
    failGeneration: async (...args: unknown[]) => {
      failCalls.push(args,);
      if (failThrows) { throw new Error("fail-track down",); }
    },
    activeGenerations: activeMap,
  }),);
}

// Only storeGenerationResult touches the DB. buildGenerationResult is pure and
// its content feeds the empty-content guard in non-stream.ts, so mirror it
// faithfully here instead of stubbing a constant.
if (STRICTLY_ISOLATED) {
  mock.module("./persist", () => ({
    buildGenerationResult: (
      response: {
        content: string;
        finishReason: string;
        usage: { promptTokens: number; completionTokens: number; totalTokens: number };
      },
      cancelled: boolean,
    ) => ({
      content: response.content,
      thinking: null,
      tokenUsage: response.usage,
      finishReason: response.finishReason,
      cancelled,
    }),
    storeGenerationResult: async () => "msg-id-1",
  }),);
}

// Stub tool-execution — not exercised in the no-tool-call path.
if (STRICTLY_ISOLATED) {
  mock.module("./tool-execution", () => ({
    executeToolCalls: async () => toolResults,
    MAX_TOOL_ROUNDS: 3,
  }),);
}

// Stub callWithFailover — we control the provider response.
let callDelayMs = 0;
const fakeResponse = {
  content: '{"ok":true}',
  finishReason: "stop" as const,
  usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15, },
  toolCalls: null as null | { id: string; function: { name: string; arguments: string } }[],
};

if (STRICTLY_ISOLATED) {
  mock.module("../providers/call-with-failover", () => ({
    callWithFailover: async (_providers: unknown, req: { messages: unknown[] },) => {
      callMessages.push(req.messages,);
      if (callDelayMs > 0) {
        await new Promise<void>(r => setTimeout(r, callDelayMs,));
      }

      if (failoverThrows) { throw new Error("provider exploded",); }
      if (responseQueue.length > 0) { return responseQueue.shift(); }
      return fakeResponse;
    },
  }),);
}

// Now import the function under test (after all mocks are in place).
const { runNonStreaming, } = await import("./non-stream");
const { callWithFailover: failoverFn, } = await import("../providers/call-with-failover");
const { buildGenerationResult: buildResultFn, } = await import("./persist");

// Bun's mock.module is process-global: without --isolate, an earlier file
// may have replaced these modules first (first-wins), so the factories
// above never apply. Fail-closed: verify this file's own doubles are the
// ones in effect (failover returns our fakeResponse identity; persist
// returns our fixed stub content) and skip otherwise instead of testing
// through another file's stubs.
const failoverSelfCheck = await (async () => {
  try {
    // The real failover throws "All providers failed" on []; our stub
    // resolves fakeResponse. A throw means our double is not in effect.
    return (await failoverFn([], { model: "m", messages: [], params: {}, },) as unknown) === fakeResponse;
  } catch {
    return false;
  }
})();

const persistSelfCheck = (buildResultFn({
  content: "__nonstream_selfcheck__",
  finishReason: "stop",
  usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, },
} as never, false,) as { content?: string }).content === "__nonstream_selfcheck__";

const nonStreamSelfOk = failoverSelfCheck && persistSelfCheck;
const describeSelf = nonStreamSelfOk ? describeOrSkipStrict : describe.skip;

const mockConfig = {
  generation: { defaultProvider: "p", defaultModels: {}, },
  templates: { llm: {}, },
} as unknown as import("../../config/schema").Config;

const mockInput = {
  actorId: "actor-1",
  chatId: "chat-1",
  parentMessageId: null,
} as unknown as import("./types").GenerateRequest;

describeSelf("runNonStreaming — generation.completed latencyMs", () => {
  it("rejects after exceeding the tool-call round limit", async () => {
    recordedEvents.length = 0;
    const originalCalls = fakeResponse.toolCalls;
    // Non-empty toolCalls every round keeps the loop spinning until it
    // exceeds MAX_TOOL_ROUNDS and throws.
    fakeResponse.toolCalls = [
      { id: "tc-1", function: { name: "noop", arguments: "{}", }, },
    ];

    const { createTestDb, } = await import("../../test-utils/create-test-db");
    const { db, sqlite, } = await createTestDb();
    // runNonStreaming converts internal errors to a 500 Response (never
    // rethrows) — assert on the rendered status and message.
    const res = await runNonStreaming({
      input: mockInput,
      database: db,
      messages: [{ role: "user", content: "hello", },],
      cfg: mockConfig,
      userId: "user-1",
      attemptId: "attempt-tools",
      modelId: "test-model",
      providerName: "test-provider",
      providerReq: { model: "test-model", messages: [], params: {}, },
      failoverList: [{ name: "test-provider", provider: {} as never, },],
    },);

    fakeResponse.toolCalls = originalCalls;
    sqlite.close();
    expect(res.status,).toBe(500,);
    const body = await res.json() as { error: string };
    expect(body.error,).toContain("Tool call loop exceeded max rounds",);
  });

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

const USAGE = { promptTokens: 10, completionTokens: 5, totalTokens: 15, };

/**
 * Run the SUT against a fresh test DB with the standard fixture shape,
 * closing the DB before returning so assertions can run afterwards.
 * @param attemptId
 */
async function runDefault(attemptId: string,): Promise<Response> {
  const { createTestDb, } = await import("../../test-utils/create-test-db");
  const { db, sqlite, } = await createTestDb();
  try {
    return await runNonStreaming({
      input: mockInput,
      database: db,
      messages: [{ role: "user", content: "hello", },],
      cfg: mockConfig,
      userId: "user-1",
      attemptId,
      modelId: "test-model",
      providerName: "test-provider",
      providerReq: { model: "test-model", messages: [], params: {}, },
      failoverList: [{ name: "test-provider", provider: {} as never, },],
    },);
  } finally {
    sqlite.close();
  }
}

describeSelf("runNonStreaming — error propagation and delivery edges", () => {
  it("rejects empty content with a 500, fails the attempt, and skips telemetry", async () => {
    recordedEvents.length = 0;
    responseQueue.push({ content: "", finishReason: "stop", usage: USAGE, toolCalls: null, },);
    const res = await runDefault("attempt-empty",);
    expect(res.status,).toBe(500,);
    const body = await res.json() as { error: string };
    expect(body.error,).toContain("LLM returned empty content",);
    expect(body.error,).toContain("finishReason=stop",);
    expect(failCalls.length,).toBe(1,);
    expect(recordedEvents.length,).toBe(0,);
  });

  it("rejects whitespace-only content (trim boundary)", async () => {
    responseQueue.push({ content: "   \n\t ", finishReason: "stop", usage: USAGE, toolCalls: null, },);
    const res = await runDefault("attempt-ws",);
    expect(res.status,).toBe(500,);
    const body = await res.json() as { error: string };
    expect(body.error,).toContain("LLM returned empty content",);
  });

  it("accepts empty content on a cancelled finish (no empty-content rejection)", async () => {
    failCalls.length = 0;
    responseQueue.push({ content: "", finishReason: "cancelled", usage: USAGE, toolCalls: null, },);
    const res = await runDefault("attempt-cancelled",);
    expect(res.status,).toBe(200,);
    const body = await res.json() as { content: string; finishReason: string };
    expect(body.content,).toBe("",);
    expect(body.finishReason,).toBe("cancelled",);
    expect(failCalls.length,).toBe(0,);
  });

  it("skips telemetry entirely when telemetry is disabled", async () => {
    recordedEvents.length = 0;
    telemetryEnabled = false;
    const res = await runDefault("attempt-notel",);
    expect(res.status,).toBe(200,);
    expect(recordedEvents.length,).toBe(0,);
  });

  it("swallows a telemetry record rejection and still returns 200", async () => {
    recordedEvents.length = 0;
    telemetryReject = true;
    const res = await runDefault("attempt-telrej",);
    expect(res.status,).toBe(200,);
    const body = await res.json() as { content: string };
    expect(body.content,).toBe(fakeResponse.content,);
    expect(recordedEvents.length,).toBe(0,);
  });

  it("swallows a memory extraction rejection and still returns 200", async () => {
    memoryReject = true;
    const res = await runDefault("attempt-memrej",);
    expect(res.status,).toBe(200,);
    const body = await res.json() as { content: string };
    expect(body.content,).toBe(fakeResponse.content,);
  });

  it("swallows a failGeneration rejection and keeps the original 500 message", async () => {
    failoverThrows = true;
    failThrows = true;
    const res = await runDefault("attempt-failthrow",);
    expect(res.status,).toBe(500,);
    const body = await res.json() as { error: string };
    expect(body.error,).toBe("Generation failed: provider exploded",);
    expect(failCalls.length,).toBe(1,);
  });

  it("marks the attempt not-delivered when the provider throws", async () => {
    failoverThrows = true;
    activeMap.set("attempt-err", { lastRenderedChunkIndex: -1, deliveryConfirmed: true, },);
    const res = await runDefault("attempt-err",);
    expect(res.status,).toBe(500,);
    const body = await res.json() as { error: string };
    expect(body.error,).toContain("provider exploded",);
    expect(failCalls.length,).toBe(1,);
    expect(activeMap.get("attempt-err",)?.deliveryConfirmed,).toBe(false,);
  });

  it("marks the attempt delivery-confirmed on success", async () => {
    activeMap.set("attempt-ok", { lastRenderedChunkIndex: -1, deliveryConfirmed: false, },);
    const res = await runDefault("attempt-ok",);
    expect(res.status,).toBe(200,);
    expect(activeMap.get("attempt-ok",)?.deliveryConfirmed,).toBe(true,);
  });

  it("feeds the assistant tool-call message and tool results back into the next round", async () => {
    responseQueue.push(
      {
        content: "",
        finishReason: "stop",
        usage: USAGE,
        toolCalls: [{ id: "tc-1", function: { name: "lookup", arguments: "{}", }, },],
      },
      { content: "final answer", finishReason: "stop", usage: USAGE, toolCalls: null, },
    );

    toolResults = [{ role: "tool", content: "tool-out", tool_call_id: "tc-1", },];
    const res = await runDefault("attempt-tools",);
    expect(res.status,).toBe(200,);
    expect(callMessages.length,).toBe(2,);
    const second = callMessages[1] as GenerationMessage[];
    expect(second.length,).toBe(3,);
    expect(second[1],).toEqual({
      role: "assistant",
      content: "",
      tool_calls: [{ id: "tc-1", type: "function", function: { name: "lookup", arguments: "{}", }, },],
    },);

    expect(second[2],).toEqual({ role: "tool", content: "tool-out", tool_call_id: "tc-1", },);
    const body = await res.json() as { content: string };
    expect(body.content,).toBe("final answer",);
  });

  it("returns the full result payload on success", async () => {
    const res = await runDefault("attempt-shape",);
    expect(res.status,).toBe(200,);
    const body = await res.json() as {
      ok: boolean;
      attemptId: string;
      messageId: string;
      content: string;
      thinking: string | null;
      tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number };
      finishReason: string;
      meta: { api_version: string };
    };

    expect(body,).toEqual({
      ok: true,
      attemptId: "attempt-shape",
      messageId: "msg-id-1",
      content: fakeResponse.content,
      thinking: null,
      tokenUsage: { promptTokens: 10, completionTokens: 5, totalTokens: 15, },
      finishReason: "stop",
      meta: { api_version: expect.any(String,), },
    },);
  });
},);
