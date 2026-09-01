// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the stop-and-respond interrupt path:
 *
 *   1. Mid-stream Stop (client disconnect mid-stream) → the provider sees
 *      an abort signal, the SSE response is truncated at the last
 *      successfully-flushed chunk, and `cancelGeneration` fires fan-out
 *      over any registered side-effect jobs.
 *   2. Billing / telemetry hook never records `generation.completed` for
 *      undelivered output — only `generation.truncated` is emitted, and
 *      the persisted `delivery_confirmed_at` stays NULL.
 *
 * The test drives the real `streamToClient` flow (no `mock.module` of
 * `cancellation-manager`) so we exercise the actual fan-out. Telemetry
 * is stubbed at the module boundary to capture `record()` calls.
 *
 * mock.module is gated to the isolated canonical gate (`bun run
 * test:unit` / `bun run check`); plain `bun test src/` skips this file.
 *
 * The dynamic `await import("../stream-to-client")` is intentional — it
 * sits behind the `mock.module(...)` boundary used to stub telemetry /
 * persist / tool-execution so the assertions can capture what
 * streamToClient actually emits. This is the canonical Bun pattern for
 * `mock.module` interception.
 */
import { afterEach, beforeEach, expect, mock, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { CancelReason, CancelSource, } from "../../../db/enums";
import type { DB, } from "../../../db/schema";
import { createLogger, } from "../../../logger";
import { createTestDb, } from "../../../test-utils/create-test-db";
import { describeOrSkip, ISOLATED, } from "../../../test-utils/isolate-only";
import {
  activeGenerations,
  cancelGenerationByChat,
  GenerationCancelledError,
  registerSideEffectJob,
  startGenerationTracking,
} from "../../cancellation-manager";
import type {
  GenerateRequest as ProviderRequest,
  GenerateResponse,
  LLMProvider,
  StreamHandler,
} from "../../providers/types";
import {
  DEFAULT_POLICY_DETECTION,
  DEFAULT_REPETITION_DETECTION,
  DEFAULT_RESPONSE_LIMIT,
} from "../../types";
import type { GenerateRequest, } from "../types";

createLogger({ level: "error", },);

// ── Telemetry capture ───────────────────────────────────────

const recordedEvents: { eventType: string; data: Record<string, unknown> }[] = [];

if (ISOLATED) {
  mock.module("../../../telemetry/service", () => ({
    record: async (_db: Kysely<DB>, params: { eventType: string; data: Record<string, unknown> },) => {
      recordedEvents.push(params,);
    },
    isTelemetryEnabled: () => true,
  }),);
  mock.module("../persist", () => ({
    buildGenerationResult: (response: GenerateResponse, cancelled: boolean,) => ({
      content: response.content,
      thinking: null,
      tokenUsage: response.usage,
      finishReason: response.finishReason,
      cancelled,
    }),
    storeGenerationResult: async () => "msg-test",
  }),);
  mock.module("../tool-execution", () => ({
    executeToolCalls: async () => [],
    MAX_TOOL_ROUNDS: 1,
  }),);
  mock.module("../../../memory", () => ({
    extractAndStoreMemories: async () => {/* noop */},
  }),);
}

const { streamToClient, } = await import("../stream-to-client");

// ── Helpers ────────────────────────────────────────────────

type Event = { type: string; [k: string]: unknown };

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
 * Provider that emits three content chunks synchronously, then waits
 * for the abort signal. Returns `cancelled` on abort, `stop` on timeout.
 */
type ProviderState = {
  chunksDelivered: number;
  sawAbort: boolean;
  firstChunkResolve: () => void;
  firstChunkPromise: Promise<void>;
};

function makeChunkyProvider(state: ProviderState,): LLMProvider {
  const { promise: firstChunkPromise, resolve: firstChunkResolve, } = Promise.withResolvers<void>();
  state.firstChunkPromise = firstChunkPromise;
  state.firstChunkResolve = firstChunkResolve;
  return {
    capabilities: { streaming: true, },
    complete: async () => {
      throw new Error("unused",);
    },
    stream: async (req: ProviderRequest, handler: StreamHandler,) => {
      const chunks = ["Hello, ", "this is ", "a streamed response.",];
      for (const c of chunks) {
        if (req.signal?.aborted) { break; }
        handler({ type: "content", content: c, },);
        state.chunksDelivered += 1;
      }
      state.firstChunkResolve();
      const aborted = req.signal
        ? await new Promise<boolean>((resolve,) => {
          if (req.signal!.aborted) {
            resolve(true,);
            return;
          }
          req.signal!.addEventListener("abort", () => resolve(true,), { once: true, },);
          setTimeout(() => resolve(false,), 1500,);
        },)
        : false;
      state.sawAbort = aborted;
      return {
        content: chunks.join("",),
        thinking: undefined,
        finishReason: aborted ? "cancelled" : "stop",
        usage: { promptTokens: 5, completionTokens: 12, totalTokens: 17, },
      } satisfies GenerateResponse;
    },
    healthCheck: async () => ({ status: "ok" as const, }),
    listModels: async () => [],
  } as unknown as LLMProvider;
}

/**
 * Drive streamToClient with a pre-tracked attempt.
 */
async function startStream(chatId: string,): Promise<{
  response: Response;
  attemptId: string;
  abortController: AbortController;
  state: ProviderState;
}> {
  const { db, } = await createTestDb();

  const { attemptId, abortSignal, } = await startGenerationTracking({
    options: {
      chatId,
      parentMessageId: "msg-parent",
      actorId: "actor-1",
      modelId: "m",
      provider: "p",
      prompt: [{ role: "user", content: "hi", },],
      idempotencyKey: `abort-${chatId}-${Math.random()}`,
      stream: true,
      repetitionDetection: { ...DEFAULT_REPETITION_DETECTION, enabled: false, },
      policyDetection: { ...DEFAULT_POLICY_DETECTION, enabled: false, },
      responseLimit: { ...DEFAULT_RESPONSE_LIMIT, },
      stepIndex: 0,
      totalSteps: 1,
    },
    db,
  },);

  const ac = new AbortController();
  abortSignal.addEventListener("abort", () => ac.abort(), { once: true, },);

  const state: ProviderState = {
    chunksDelivered: 0,
    sawAbort: false,
    firstChunkPromise: undefined as unknown as Promise<void>,
    firstChunkResolve: undefined as unknown as () => void,
  };
  const provider = makeChunkyProvider(state,);

  const response = streamToClient({
    input: { chatId, actorId: "actor-1", parentMessageId: "msg-parent", } as unknown as GenerateRequest,
    database: db,
    messages: [],
    cfg: { generation: {}, } as never,
    userId: "user-1",
    attemptId,
    modelId: "m",
    providerName: "p",
    providerReq: {
      model: "m",
      params: { stream: true, },
      signal: ac.signal,
    } as ProviderRequest,
    failoverList: [{ name: "p", provider, },],
  },);

  return { response, attemptId, abortController: ac, state, };
}

beforeEach(() => {
  recordedEvents.length = 0;
  activeGenerations.clear();
},);

afterEach(() => {
  activeGenerations.clear();
},);

describeOrSkip("streamToClient — stop-and-respond interrupt", () => {
  test(
    "cancelGenerationByChat fans out to registered side-effect jobs",
    async () => {
      const chatId = `chat-sideeffect-${Date.now()}-${Math.random()}`;
      const { attemptId, } = await startStream(chatId,);

      let ttsCancelled = false;
      let imageQueueCancelled = false;

      registerSideEffectJob(attemptId, {
        id: "tts-1",
        kind: "tts",
        cancel: () => {
          ttsCancelled = true;
        },
      },);
      registerSideEffectJob(attemptId, {
        id: "img-1",
        kind: "image-queue",
        cancel: () => {
          imageQueueCancelled = true;
        },
      },);

      const cancelled = cancelGenerationByChat({
        db: {} as Kysely<DB>,
        chatId,
        reason: CancelReason.UserCancel,
        source: CancelSource.User,
        detail: "user clicked stop",
      },);

      expect(cancelled,).toBe(true,);
      expect(ttsCancelled,).toBe(true,);
      expect(imageQueueCancelled,).toBe(true,);
      expect(activeGenerations.has(attemptId,),).toBe(false,);
    },
    5000,
  );

  test(
    "successful full-stream delivery records generation.completed only",
    async () => {
      const chatId = `chat-full-${Date.now()}-${Math.random()}`;
      const { response, abortController, } = await startStream(chatId,);

      const events = await collectEvents(response,);
      const done = events.find((e,) => e.type === "done");
      expect(done,).toBeDefined();

      const completed = recordedEvents.find((e,) => e.eventType === "generation.completed");
      const truncated = recordedEvents.find((e,) => e.eventType === "generation.truncated");
      expect(completed,).toBeDefined();
      expect(completed?.data.deliveryConfirmed,).toBe(true,);
      expect(truncated,).toBeUndefined();

      const noAbortedActive = activeGenerations.size === 0 ||
        Array.from(activeGenerations.values(),).every((a,) => !a.abortController.signal.aborted);
      expect(noAbortedActive,).toBe(true,);
      void abortController;
    },
    10000,
  );

  test(
    "client disconnect mid-stream truncates SSE at last delivered chunk",
    async () => {
      const chatId = `chat-disconnect-${Date.now()}-${Math.random()}`;
      const { response, abortController, state, } = await startStream(chatId,);

      const eventsPromise = collectEvents(response,);
      await state.firstChunkPromise;
      abortController.abort();

      const events = await eventsPromise;

      const done = events.find((e,) => e.type === "done");
      const content = events.filter((e,) => e.type === "content");
      expect(done,).toBeDefined();
      expect(done?.cancelled,).toBe(true,);
      expect(content.length,).toBeGreaterThan(0,);
      expect(state.sawAbort,).toBe(true,);

      const completed = recordedEvents.find((e,) => e.eventType === "generation.completed");
      expect(completed,).toBeUndefined();
      const truncated = recordedEvents.find((e,) => e.eventType === "generation.truncated");
      expect(truncated,).toBeDefined();
      expect(truncated?.data.deliveryConfirmed,).toBe(false,);
    },
    10000,
  );
},);

// Import the type so future tests can extend error-path coverage without
// re-importing it; suppresses unused-import lint.
void GenerationCancelledError;
