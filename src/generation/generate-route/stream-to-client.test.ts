// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the stream-to-client cancel wiring
 * (BUG-auto-gen-streaming-path-unhandled-rejection-abort-never-wire).
 *
 * The SSE streaming path builds its own local AbortController for the
 * provider call; the generation tracker's signal (aborted by
 * cancelGeneration / user cancel) must be linked into it, otherwise a user
 * cancel never reaches the provider stream.
 *
 * mock.module is gated to the isolated canonical gate (bun run test:unit /
 * check); plain `bun test src/` skips this file.
 */
import { expect, mock, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import { CancelReason, CancelSource, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { describeOrSkip, ISOLATED, } from "../../test-utils/isolate-only";
import { GenerationCancelledError, } from "../cancellation-actions/error";
import type {
  GenerateRequest as ProviderRequest,
  GenerateResponse,
  LLMProvider,
  StreamHandler,
} from "../providers/types";

createLogger({ level: "error", },);

if (ISOLATED) {
  mock.module("../cancellation-manager", () => ({
    processStreamingChunk: async () => "continue",
    activeGenerations: {
      get: () => undefined,
      set: () => {},
      delete: () => {},
      clear: () => {},
      has: () => false,
      size: 0,
      values: () => [],
      keys: () => [],
      entries: () => [],
      forEach: () => {},
    },
    cancelGeneration: () => false,
    registerSideEffectJob: () => false,
    unregisterSideEffectJob: () => false,
    listSideEffectJobs: () => [],
    failGeneration: async () => {/* noop */},
  }),);
  mock.module("./persist", () => ({
    /**
     * @param response
     * @param cancelled
     */
    buildGenerationResult: (response: GenerateResponse, cancelled: boolean,) => ({
      content: response.content,
      thinking: null,
      tokenUsage: response.usage,
      finishReason: response.finishReason,
      cancelled,
    }),
    storeGenerationResult: async () => "msg-x",
  }),);
  mock.module("./tool-execution", () => ({
    executeToolCalls: async () => [],
    MAX_TOOL_ROUNDS: 1,
  }),);
  mock.module("../../memory", () => ({
    extractAndStoreMemories: async () => {/* noop */},
  }),);
}

const { streamToClient, } = await import("./stream-to-client");

type Event = { type: string; cancelled?: boolean; finishReason?: string; content?: string };

/**
 * Provider that emits one chunk, then waits for its request signal to abort.
 * Resolves cancelled when it observes the abort, "stop" on timeout.
 * @param state
 */
function makeWaitingProvider(state: { calls: number; sawAbort: boolean },): LLMProvider {
  return {
    capabilities: { streaming: true, },
    complete: async () => {
      throw new Error("unused",);
    },
    stream: async (req: ProviderRequest, handler: StreamHandler,) => {
      state.calls += 1;
      handler({ type: "content", content: "partial ", },);
      const sig = req.signal;
      const aborted = await new Promise<boolean>((resolve,) => {
        if (!sig) {
          resolve(false,);
          return;
        }
        if (sig.aborted) {
          resolve(true,);
          return;
        }
        sig.addEventListener("abort", () => resolve(true,), { once: true, },);
        setTimeout(() => resolve(false,), 1500,);
      },);
      state.sawAbort = aborted;
      return {
        content: "partial ",
        thinking: undefined,
        finishReason: aborted ? "cancelled" : "stop",
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2, },
      } satisfies GenerateResponse;
    },
    healthCheck: async () => ({ status: "ok" as const, }),
    listModels: async () => [],
  } as unknown as LLMProvider;
}

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
 * @param trackerSignal
 * @param provider
 */
function run(trackerSignal: AbortSignal, provider: LLMProvider,): Response {
  return streamToClient({
    input: { chatId: "chat-1", actorId: "actor-1", parentMessageId: "p1", } as unknown as Parameters<
      typeof streamToClient
    >[0]["input"],
    database: {} as Kysely<DB>,
    messages: [],
    cfg: {} as Config,
    userId: "user-1",
    attemptId: "att-1",
    modelId: "m",
    providerName: "p",
    providerReq: {
      model: "m",
      params: { stream: true, },
      signal: trackerSignal,
    } as ProviderRequest,
    failoverList: [{ name: "p", provider, },],
  },);
}

describeOrSkip("streamToClient — tracker cancel reaches the provider", () => {
  test("tracker abort mid-stream cancels the provider and yields a cancelled done event", async () => {
    const tracker = new AbortController();
    const state = { calls: 0, sawAbort: false, };
    const response = run(tracker.signal, makeWaitingProvider(state,),);

    const eventsPromise = collectEvents(response,);
    // Give start() a tick to link the signals and reach the provider.
    await new Promise((r,) => setTimeout(r, 10,));
    tracker.abort(new GenerationCancelledError(CancelReason.UserCancel, CancelSource.User, "test cancel",),);

    const events = await eventsPromise;
    expect(state.calls,).toBe(1,);
    expect(state.sawAbort,).toBe(true,);
    const done = events.find((e,) => e.type === "done");
    expect(done,).toBeDefined();
    expect(done?.cancelled,).toBe(true,);
    expect(done?.finishReason,).toBe("cancelled",);
  });

  test("tracker already aborted before start() cancels without provider restart", async () => {
    const tracker = new AbortController();
    tracker.abort(new GenerationCancelledError(CancelReason.ChatSwitch, CancelSource.ChatSwitch, "switch",),);
    const state = { calls: 0, sawAbort: false, };
    const events = await collectEvents(run(tracker.signal, makeWaitingProvider(state,),),);

    expect(state.sawAbort,).toBe(true,);
    const done = events.find((e,) => e.type === "done");
    expect(done?.cancelled,).toBe(true,);
  });

  test("provider throw post-abort classifies as cancelled done, not error (BUG-stream-cancel)", async () => {
    // A provider that THROWS (instead of returning) after observing the abort
    // propagates a GenerationCancelledError through callWithFailover. The
    // stream catch must route it to cancelled-done — not failGeneration/error.
    const tracker = new AbortController();
    let aborted = false;
    const provider: LLMProvider = {
      capabilities: { streaming: true, },
      complete: async () => {
        throw new Error("unused",);
      },
      stream: async (req: ProviderRequest, handler: StreamHandler,) => {
        handler({ type: "content", content: "partial ", },);
        const sig = req.signal;
        if (sig) {
          await new Promise<void>((resolve,) => {
            if (sig.aborted) {
              resolve();
              return;
            }
            sig.addEventListener("abort", () => resolve(), { once: true, },);
          },);
          aborted = true;
        }
        // Simulate the underlying SDK surfacing the abort as a thrown error.
        throw new Error("stream aborted",);
      },
      healthCheck: async () => ({ status: "ok" as const, }),
      listModels: async () => [],
    } as unknown as LLMProvider;

    const response = run(tracker.signal, provider,);
    const eventsPromise = collectEvents(response,);
    await new Promise((r,) => setTimeout(r, 10,));
    tracker.abort(new GenerationCancelledError(CancelReason.UserCancel, CancelSource.User, "user stop",),);
    const events = await eventsPromise;

    expect(aborted,).toBe(true,);
    const done = events.find((e,) => e.type === "done");
    expect(done,).toBeDefined();
    expect(done?.cancelled,).toBe(true,);
    expect(done?.finishReason,).toBe("cancelled",);
    expect(events.some((e,) => e.type === "error"),).toBe(false,);
  });

  test("provider failure emits generic error event without internal message", async () => {
    const tracker = new AbortController();
    const provider = {
      capabilities: { streaming: true, },
      complete: async () => {
        throw new Error("unused",);
      },
      stream: async () => {
        throw new Error("SECRET: pg-dsn=postgres://user:pw@db.internal/host",);
      },
      healthCheck: async () => ({ status: "ok" as const, }),
      listModels: async () => [],
    } as unknown as LLMProvider;

    const events = await collectEvents(run(tracker.signal, provider,),);
    const err = events.find((e,) => e.type === "error",) as { error?: string } | undefined;
    expect(err,).toBeDefined();
    expect(err?.error,).toBe("Generation failed",);
    const raw = JSON.stringify(events,);
    expect(raw.includes("SECRET"),).toBe(false,);
  });
},);
