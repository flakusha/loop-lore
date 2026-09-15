// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Coverage tests for generation/generate-route/stream-to-client.ts —
 * success path (content + thinking), tool-call rounds, max-rounds/empty
 * rejections, telemetry/memory fan-out, cancel paths, client disconnect.
 *
 * mock.module doubles the DB-touching seams (persist, cancellation-manager,
 * tool-execution, tool-result-persist, telemetry, memory); the SUT import is
 * dynamic so the doubles register first (same pattern as
 * stream-to-client.test.ts).
 */

import { expect, mock, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import { CancelReason, CancelSource, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { describeOrSkipStrict, STRICTLY_ISOLATED, } from "../../test-utils/isolate-only";
import { GenerationCancelledError, } from "../cancellation-actions/error";
import type {
  ChunkEvent,
  GenerateRequest as ProviderRequest,
  GenerateResponse,
  LLMProvider,
  StreamHandler,
  ToolCall,
} from "../providers/types";

createLogger({ level: "error", },);

const state = {
  active: new Map<string, { lastRenderedChunkIndex: number; deliveryConfirmed: boolean }>(),
  telemetryEnabled: false,
  telemetryEvents: [] as { eventType: string }[],
  telemetryReject: false,
  memoryCalls: [] as unknown[],
  memoryReject: false,
  chunkCalls: [] as { attemptId: string; chunk: string }[],
  chunkRejectOnce: false,
  cancelCalls: [] as unknown[],
  failCalls: [] as unknown[],
  failThrows: false,
  storeCalls: [] as unknown[],
  toolCallsArgs: [] as unknown[],
  toolResults: [] as { role: string; content: string; tool_call_id?: string }[],
};

/** */
function resetState(): void {
  state.active.clear();
  state.telemetryEnabled = false;
  state.telemetryEvents = [];
  state.telemetryReject = false;
  state.memoryCalls = [];
  state.memoryReject = false;
  state.chunkCalls = [];
  state.chunkRejectOnce = false;
  state.cancelCalls = [];
  state.failCalls = [];
  state.failThrows = false;
  state.storeCalls = [];
  state.toolCallsArgs = [];
  state.toolResults = [];
}

if (STRICTLY_ISOLATED) {
  mock.module("../cancellation-manager", () => ({
    activeGenerations: state.active,
    processStreamingChunk: async (opts: { attemptId: string; chunk: string },) => {
      state.chunkCalls.push(opts,);
      if (state.chunkRejectOnce) {
        state.chunkRejectOnce = false;
        throw new Error("detect down",);
      }
      return "continue";
    },
    cancelGeneration: (...args: unknown[]) => {
      state.cancelCalls.push(args,);
      return true;
    },
    failGeneration: async (...args: unknown[]) => {
      state.failCalls.push(args,);
      if (state.failThrows) { throw new Error("fail-track down",); }
    },
  }),);
}

if (STRICTLY_ISOLATED) {
  mock.module("./persist", () => ({
    buildGenerationResult: (
      response: { content: string; finishReason: string; usage: GenerateResponse["usage"] },
      cancelled: boolean,
    ) => ({
      content: response.content,
      thinking: null,
      tokenUsage: response.usage,
      finishReason: response.finishReason,
      cancelled,
    }),
    storeGenerationResult: async (opts: unknown,) => {
      state.storeCalls.push(opts,);
      return "msg-cov-1";
    },
  }),);
}

if (STRICTLY_ISOLATED) {
  mock.module("./tool-execution", () => ({
    executeToolCalls: async (toolCalls: unknown,) => {
      state.toolCallsArgs.push(toolCalls,);
      return state.toolResults;
    },
    MAX_TOOL_ROUNDS: 5,
  }),);
}

if (STRICTLY_ISOLATED) {
  mock.module("../../telemetry/service", () => ({
    isTelemetryEnabled: () => state.telemetryEnabled,
    record: async (_db: unknown, event: { eventType: string },) => {
      state.telemetryEvents.push(event,);
      if (state.telemetryReject) { throw new Error("telemetry down",); }
    },
  }),);
}

if (STRICTLY_ISOLATED) {
  mock.module("../../memory", () => ({
    extractAndStoreMemories: async (...args: unknown[]) => {
      state.memoryCalls.push(args,);
      if (state.memoryReject) { throw new Error("memory down",); }
    },
  }),);
}

// mock.module must register before the SUT import; static import would bind
// first, so the dynamic import below is load-bearing (not a style choice).
const { streamToClient, } = await import("./stream-to-client");

const USAGE = { promptTokens: 1, completionTokens: 2, totalTokens: 3, };

type Event = {
  type: string;
  content?: string;
  cancelled?: boolean;
  finishReason?: string;
  messageId?: string;
  error?: string;
  lastRenderedChunkIndex?: number;
};

/**
 * @param response
 */
async function collectEvents(response: Response,): Promise<Event[]> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let text = "";
  const events: Event[] = [];
  for (;;) {
    const { done, value, } = await reader.read();
    if (done) { break; }
    text += decoder.decode(value, { stream: true, },);
    let idx: number;
    while ((idx = text.indexOf("\n\n",)) !== -1) {
      const frame = text.slice(0, idx,);
      text = text.slice(idx + 2,);
      const line = frame.split("\n",).find((l,) => l.startsWith("data: ",));
      if (line) { events.push(JSON.parse(line.slice(6,),) as Event,); }
    }
  }
  return events;
}

/**
 * One real event-loop turn so the SUT's start() links signals and reaches
 * the provider before the test aborts. Fake timers cannot drive the live
 * ReadableStream + provider handshake (same reason the adjacent
 * stream-to-client.test.ts uses real 10ms waits).
 * @param ms
 */
async function tick(ms = 10,): Promise<void> {
  const { promise, resolve, } = Promise.withResolvers<void>();
  setTimeout(resolve, ms,);
  await promise;
}

/**
 * Provider that emits fixed chunks, then returns a fixed response.
 * @param chunks
 * @param response
 */
function textProvider(
  chunks: ChunkEvent[],
  response: { content: string; finishReason: GenerateResponse["finishReason"] },
): { provider: LLMProvider; seen: { calls: number } } {
  const seen = { calls: 0, };
  const provider = {
    capabilities: { streaming: true, },
    complete: async () => {
      throw new Error("unused",);
    },
    stream: async (_req: ProviderRequest, handler: StreamHandler,) => {
      seen.calls += 1;
      for (const chunk of chunks) { handler(chunk,); }
      return { content: response.content, finishReason: response.finishReason, usage: USAGE, };
    },
    healthCheck: async () => ({ status: "ok" as const, }),
    listModels: async () => [],
  } as unknown as LLMProvider;
  return { provider, seen, };
}

let idSeq = 0;
/**
 * @param provider
 * @param providerName
 * @param signal
 * @param seed - seed the mocked activeGenerations entry before start() runs
 */
function run(
  provider: LLMProvider,
  providerName: string,
  signal?: AbortSignal,
  seed = false,
): { response: Response; attemptId: string; chatId: string } {
  idSeq += 1;
  const attemptId = `cov-att-${idSeq}`;
  const chatId = `cov-chat-${idSeq}`;
  // ReadableStream start() flushes synchronously on construction, so the
  // active entry must exist before streamToClient() is called.
  if (seed) { seedActive(attemptId,); }
  const response = streamToClient({
    input: { chatId, actorId: "cov-actor", parentMessageId: "p1", } as unknown as Parameters<
      typeof streamToClient
    >[0]["input"],
    database: {} as Kysely<DB>,
    messages: [],
    cfg: {} as Config,
    userId: "cov-user",
    attemptId,
    modelId: "cov-model",
    providerName: providerName,
    providerReq: {
      model: "cov-model",
      params: { stream: true, },
      ...(signal ? { signal, } : {}),
    } as ProviderRequest,
    failoverList: [{ name: providerName, provider, },],
  },);
  return { response, attemptId, chatId, };
}

/**
 * @param attemptId
 */
function seedActive(attemptId: string,): void {
  state.active.set(attemptId, { lastRenderedChunkIndex: -1, deliveryConfirmed: false, },);
}

describeOrSkipStrict("streamToClient coverage", () => {
  test("streams content + thinking and closes with done, telemetry + memory fire", async () => {
    resetState();
    state.telemetryEnabled = true;
    const { provider, } = textProvider(
      [
        { type: "content", content: "Hello ", },
        { type: "thinking", content: "hmm", },
        { type: "content", content: "world", },
      ],
      { content: "Hello world", finishReason: "stop", },
    );
    const { response, attemptId, } = run(provider, "cov-p-success", undefined, true,);
    const events = await collectEvents(response,);

    expect(events.filter((e,) => e.type === "content").map((e,) => e.content),).toEqual([
      "Hello ",
      "world",
    ],);
    expect(events.filter((e,) => e.type === "thinking").map((e,) => e.content),).toEqual([
      "hmm",
    ],);
    const done = events.find((e,) => e.type === "done");
    expect(done?.cancelled,).toBe(false,);
    expect(done?.finishReason,).toBe("stop",);
    expect(done?.content,).toBe("Hello world",);
    expect(done?.messageId,).toBe("msg-cov-1",);
    expect(done?.lastRenderedChunkIndex,).toBeGreaterThanOrEqual(0,);
    expect(state.chunkCalls.length,).toBe(2,);
    expect(state.storeCalls.length,).toBe(1,);
    expect(state.active.get(attemptId,)?.deliveryConfirmed,).toBe(true,);
    expect(state.telemetryEvents.map((e,) => e.eventType),).toEqual([
      "generation.completed",
    ],);
    expect(state.memoryCalls.length,).toBe(1,);
  });

  test("chunk-detection rejection is swallowed; done still closes without an active entry", async () => {
    resetState();
    state.chunkRejectOnce = true;
    const { provider, } = textProvider(
      [{ type: "content", content: "hi", },],
      { content: "hi", finishReason: "stop", },
    );
    const events = await collectEvents(run(provider, "cov-p-chunkfail",).response,);
    const done = events.find((e,) => e.type === "done");
    expect(done?.cancelled,).toBe(false,);
    expect(done?.lastRenderedChunkIndex,).toBe(-1,);
    expect(events.some((e,) => e.type === "error"),).toBe(false,);
    expect(state.telemetryEvents.length,).toBe(0,);
    expect(state.memoryCalls.length,).toBe(0,);
  });

  test("tool-call round appends tool frames then streams the final response", async () => {
    resetState();
    let calls = 0;
    const toolCall: ToolCall = {
      id: "tc-1",
      type: "function",
      function: { name: "lookup", arguments: '{"q":"x"}', },
    };
    const provider = {
      capabilities: { streaming: true, },
      complete: async () => {
        throw new Error("unused",);
      },
      stream: async (_req: ProviderRequest, handler: StreamHandler,) => {
        calls += 1;
        if (calls === 1) {
          handler({ type: "content", content: "part1 ", },);
          return { content: "part1 ", toolCalls: [toolCall,], finishReason: "stop", usage: USAGE, };
        }
        return { content: "part1 done", finishReason: "stop", usage: USAGE, };
      },
      healthCheck: async () => ({ status: "ok" as const, }),
      listModels: async () => [],
    } as unknown as LLMProvider;
    state.toolResults = [{ role: "tool", content: "tool-out", tool_call_id: "tc-1", },];
    const events = await collectEvents(run(provider, "cov-p-tools",).response,);

    expect(calls,).toBe(2,);
    expect(events.some((e,) => e.type === "tool_call"),).toBe(true,);
    const done = events.find((e,) => e.type === "done");
    expect(done?.content,).toBe("part1 done",);
    expect(state.toolCallsArgs.length,).toBe(1,);
    // The mocked executeToolCalls skips inline persistence; streamToClient
    // never writes tool rows itself (BUG-tool-call-result-no-frontend-rendering).
  });

  test("tool calls every round exceed max rounds and emit a generic error", async () => {
    resetState();
    const toolCall: ToolCall = {
      id: "tc-x",
      type: "function",
      function: { name: "loop", arguments: "{}", },
    };
    const looping = {
      capabilities: { streaming: true, },
      complete: async () => {
        throw new Error("unused",);
      },
      stream: async () => ({
        content: "",
        toolCalls: [toolCall,],
        finishReason: "stop" as const,
        usage: USAGE,
      }),
      healthCheck: async () => ({ status: "ok" as const, }),
      listModels: async () => [],
    } as unknown as LLMProvider;
    const events = await collectEvents(run(looping, "cov-p-maxrounds",).response,);
    expect(state.toolCallsArgs.length,).toBe(5,);
    const err = events.find((e,) => e.type === "error");
    expect(err?.error,).toBe("Generation failed",);
    expect(state.failCalls.length,).toBe(1,);
  });

  test("empty streamed content is rejected with a generic error", async () => {
    resetState();
    const { provider, } = textProvider([], { content: "", finishReason: "stop", },);
    const events = await collectEvents(run(provider, "cov-p-empty",).response,);
    const err = events.find((e,) => e.type === "error");
    expect(err?.error,).toBe("Generation failed",);
    expect(events.some((e,) => e.type === "done"),).toBe(false,);
    expect(state.storeCalls.length,).toBe(0,);
  });

  test("cancelled finish marks truncated telemetry and skips memory", async () => {
    resetState();
    state.telemetryEnabled = true;
    const { provider, } = textProvider(
      [{ type: "content", content: "partial", },],
      { content: "partial", finishReason: "cancelled", },
    );
    const { response, attemptId, } = run(provider, "cov-p-cancelled", undefined, true,);
    const events = await collectEvents(response,);
    const done = events.find((e,) => e.type === "done");
    expect(done?.cancelled,).toBe(true,);
    expect(done?.finishReason,).toBe("cancelled",);
    expect(state.active.get(attemptId,)?.deliveryConfirmed,).toBe(false,);
    expect(state.telemetryEvents.map((e,) => e.eventType),).toEqual([
      "generation.truncated",
    ],);
    expect(state.memoryCalls.length,).toBe(0,);
  });

  test("pre-aborted tracker skips chunk accumulation and yields cancelled done", async () => {
    resetState();
    const tracker = new AbortController();
    tracker.abort(new GenerationCancelledError(CancelReason.UserCancel, CancelSource.User, "early",),);
    const { provider, seen, } = textProvider(
      [{ type: "content", content: "late ", },],
      { content: "late ", finishReason: "cancelled", },
    );
    const events = await collectEvents(run(provider, "cov-p-preabort", tracker.signal,).response,);
    expect(seen.calls,).toBe(1,);
    expect(events.some((e,) => e.type === "content"),).toBe(false,);
    const done = events.find((e,) => e.type === "done");
    expect(done?.cancelled,).toBe(true,);
  });

  test("tracker abort mid-stream yields cancelled done without an error frame", async () => {
    resetState();
    const tracker = new AbortController();
    const seen = { sawAbort: false, };
    const provider = {
      capabilities: { streaming: true, },
      complete: async () => {
        throw new Error("unused",);
      },
      stream: async (req: ProviderRequest, handler: StreamHandler,) => {
        handler({ type: "content", content: "partial ", },);
        const sig = req.signal;
        const { promise, resolve, } = Promise.withResolvers<boolean>();
        if (!sig) {
          resolve(false,);
        } else if (sig.aborted) {
          resolve(true,);
        } else {
          sig.addEventListener("abort", () => resolve(true,), { once: true, },);
          // Fallback so a missed abort cannot park the test forever; the
          // abort below fires long before it.
          setTimeout(() => resolve(false,), 500,);
        }
        const aborted = await promise;
        seen.sawAbort = aborted;
        return {
          content: "partial ",
          finishReason: aborted ? "cancelled" : "stop",
          usage: USAGE,
        } satisfies GenerateResponse;
      },
      healthCheck: async () => ({ status: "ok" as const, }),
      listModels: async () => [],
    } as unknown as LLMProvider;
    const { response, } = run(provider, "cov-p-midabort", tracker.signal,);
    const eventsPromise = collectEvents(response,);
    await tick();
    tracker.abort(new GenerationCancelledError(CancelReason.UserCancel, CancelSource.User, "stop",),);
    const events = await eventsPromise;
    expect(seen.sawAbort,).toBe(true,);
    const done = events.find((e,) => e.type === "done");
    expect(done?.cancelled,).toBe(true,);
    expect(events.some((e,) => e.type === "error"),).toBe(false,);
  });

  test("client disconnect aborts the provider and fans out cancelGeneration", async () => {
    resetState();
    const seen = { sawAbort: false, firstChunk: false, };
    const provider = {
      capabilities: { streaming: true, },
      complete: async () => {
        throw new Error("unused",);
      },
      stream: async (req: ProviderRequest, handler: StreamHandler,) => {
        handler({ type: "content", content: "partial ", },);
        seen.firstChunk = true;
        req.signal?.addEventListener("abort", () => {
          seen.sawAbort = true;
        }, { once: true, },);
        // Never resolves: the disconnect parks start() mid-provider-call,
        // so no post-cancel enqueue can race the cancelled reader.
        await Promise.withResolvers<void>().promise;
        throw new Error("unreachable",);
      },
      healthCheck: async () => ({ status: "ok" as const, }),
      listModels: async () => [],
    } as unknown as LLMProvider;
    const ctrl = new AbortController();
    const { response, attemptId, } = run(provider, "cov-p-disconnect", ctrl.signal, true,);
    const reader = response.body!.getReader();
    const first = await reader.read();
    expect(first.done,).toBe(false,);
    expect(seen.firstChunk,).toBe(true,);
    await reader.cancel("client gone",);
    await tick(20,);
    expect(seen.sawAbort,).toBe(true,);
    expect(state.cancelCalls.length,).toBe(1,);
    expect(state.active.get(attemptId,)?.deliveryConfirmed,).toBe(false,);
    reader.releaseLock();
  });

  test("telemetry + memory rejections are swallowed; stream still closes done", async () => {
    resetState();
    state.telemetryEnabled = true;
    state.telemetryReject = true;
    state.memoryReject = true;
    const { provider, } = textProvider(
      [{ type: "content", content: "ok", },],
      { content: "ok", finishReason: "stop", },
    );
    const { response, } = run(provider, "cov-p-swallow", undefined, true,);
    const events = await collectEvents(response,);
    expect(events.find((e,) => e.type === "done")?.cancelled,).toBe(false,);
    expect(state.telemetryEvents.length,).toBe(1,);
    expect(state.memoryCalls.length,).toBe(1,);
  });

  test("provider failure emits a generic error frame without leaking internals", async () => {
    resetState();
    state.failThrows = true;
    const provider = {
      capabilities: { streaming: true, },
      complete: async () => {
        throw new Error("unused",);
      },
      stream: async () => {
        throw new Error("SECRET: [REDACTED:API key param]",);
      },
      healthCheck: async () => ({ status: "ok" as const, }),
      listModels: async () => [],
    } as unknown as LLMProvider;
    const events = await collectEvents(run(provider, "cov-p-fail",).response,);
    const err = events.find((e,) => e.type === "error");
    expect(err?.error,).toBe("Generation failed",);
    expect(JSON.stringify(events,).includes("SECRET",),).toBe(false,);
    expect(state.failCalls.length,).toBe(1,);
  });
},);
