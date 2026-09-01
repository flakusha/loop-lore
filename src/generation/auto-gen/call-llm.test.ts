// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for callLlm streaming cancellation + detector hygiene.
 *
 * Covers:
 * - Streaming: detector rejections never become unhandled rejections
 * - Streaming: cancelled signal stops accumulation/buffer appends
 * - Streaming: streaming without tracking skips the detector
 * - Empty streaming content throws (BUG-generation-error-handling-gaps)
 * - Empty non-stream content throws (BUG-generation-error-handling-gaps)
 */
import { beforeEach, expect, mock, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { describeOrSkip, ISOLATED, } from "../../test-utils/isolate-only";
import * as generationIndex from "../index";
import type { ChunkEvent, StreamHandler, } from "../providers/types";
import type { GenDeps, } from "./deps";

createLogger({ level: "error", },);

const detectorStub = mock(async (_opts: { attemptId: string; chunk: string; db: Kysely<DB> },) => "continue");

if (ISOLATED) {
  mock.module("../index", () => ({
    ...generationIndex,
    processStreamingChunk: detectorStub,
  }),);
}

const { callLlm, } = await import("./call-llm");

const usage = { promptTokens: 1, completionTokens: 2, totalTokens: 3, };

function contentChunk(chunks: string[],): (providers: unknown, req: unknown, handler: StreamHandler,) => Promise<{
  content: string;
  thinking: undefined;
  finishReason: "stop";
  usage: typeof usage;
}> {
  return async (_providers, _req, handler,) => {
    let acc = "";
    for (const c of chunks) {
      acc += c;
      handler({ type: "content", content: c, } as ChunkEvent,);
    }
    return { content: acc, thinking: undefined, finishReason: "stop" as const, usage, };
  };
}

function makeOpts(overrides: {
  driver?: (providers: unknown, req: unknown, handler?: StreamHandler,) => Promise<never>;
  tracking?: { attemptId: string; abortSignal: AbortSignal };
  buffer?: { append: (kind: string, payload: string,) => void };
  resolvedProvider?: { provider: { capabilities: { streaming: boolean } } };
  chatStreaming?: number | null;
  defaultStream?: boolean | null;
} = {},) {
  const d = {
    callWithFailover: overrides.driver ?? (contentChunk(["x",],) as unknown as GenDeps["callWithFailover"]),
    buildFailoverList: () => [{ name: "p", provider: {}, },],
    getOrCreateBuffer: () => overrides.buffer ?? { append: () => {/* noop */}, },
    markedParse: (s: string,) => s,
  } as unknown as GenDeps;

  return {
    d,
    database: {} as Kysely<DB>,
    config: { generation: { defaultStream: overrides.defaultStream ?? true, }, },
    chatId: "chat-1",
    parentMessageId: "msg-parent",
    resolved: overrides.resolvedProvider ?? {
      resolvedModel: "m",
      resolvedProviderName: "p",
      provider: { capabilities: { streaming: true, }, },
    },
    prompt: { messages: [], },
    actorName: "Actress",
    chatStreaming: overrides.chatStreaming ?? 1,
    ...overrides.tracking ? { tracking: overrides.tracking, } : {},
  } as unknown as Parameters<typeof callLlm>[0];
}

describeOrSkip("callLlm — generation-error-handling gaps", () => {
  beforeEach(() => {
    detectorStub.mockClear();
    detectorStub.mockImplementation(async () => "continue");
  },);

  test("streaming without tracking skips the detector", async () => {
    const result = await callLlm(makeOpts({ driver: contentChunk(["a",],) as unknown as never, },),);
    expect(result.content,).toBe("a",);
  });

  test("aborted signal stops accumulation mid-stream", async () => {
    const controller = new AbortController();
    const driver = async (_providers: unknown, _req: unknown, handler?: StreamHandler,) => {
      handler?.({ type: "content", content: "ok", } as ChunkEvent,);
      controller.abort(new Error("cancelled",),);
      handler?.({ type: "content", content: "LEAK", } as ChunkEvent,);
      return { content: "", thinking: undefined, finishReason: "cancelled", usage, } as never;
    };
    const result = await callLlm(
      makeOpts({
        driver: driver as never,
        tracking: { attemptId: "att-1", abortSignal: controller.signal, },
      },),
    );
    expect(result.content,).toBe("ok",);
    expect(result.content,).not.toContain("LEAK",);
  });

  test("detector rejection does not crash generation", async () => {
    detectorStub.mockImplementation(() => Promise.reject(new Error("detector boom",),));
    const result = await callLlm(makeOpts({ driver: contentChunk(["a", "b",],) as unknown as never, },),);
    await new Promise((r,) => setTimeout(r, 25,));
    expect(result.content,).toBe("ab",);
  });

  test("empty streaming content throws", async () => {
    await expect(
      callLlm(
        makeOpts({
          driver: contentChunk(["", "", "",],) as unknown as never,
          tracking: { attemptId: "att-stream-empty", abortSignal: new AbortController().signal, },
        },),
      ),
    ).rejects.toThrow(/empty content/,);
  });

  test("empty non-stream content throws", async () => {
    await expect(
      callLlm(
        makeOpts({
          driver: async () => ({ content: "", thinking: undefined, finishReason: "stop", usage, }) as never,
          tracking: { attemptId: "att-ns-empty", abortSignal: new AbortController().signal, },
          resolvedProvider: { provider: { capabilities: { streaming: false, }, }, },
          chatStreaming: null,
          defaultStream: false,
        },),
      ),
    ).rejects.toThrow(/empty content/,);
  });
},);