// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for callLlm streaming cancellation + detector hygiene
 * (BUG-auto-gen-streaming-path-unhandled-rejection-abort-never-wire).
 *
 * Covers: detector rejections never become unhandled rejections; a cancelled
 * generation stops accumulation/buffer appends immediately; streaming without
 * tracking skips the detector (no silent empty-attemptId no-ops).
 *
 * Uses mock.module (gated to the isolated `bun run test:unit` / `check`
 * canonical gate) to replace the generation barrel's processStreamingChunk.
 */
import { afterEach, beforeEach, expect, mock, test, } from "bun:test";
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

/**
 * @param chunks
 */
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

/**
 * @param overrides
 * @param overrides.driver
 * @param overrides.tracking
 * @param overrides.buffer
 */
function makeOpts(overrides: {
  driver?: (providers: unknown, req: unknown, handler?: StreamHandler,) => Promise<never>;
  tracking?: { attemptId: string; abortSignal: AbortSignal };
  buffer?: { append: (kind: string, payload: string,) => void };
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
    config: { generation: { defaultStream: true, }, },
    chatId: "chat-1",
    parentMessageId: "msg-parent",
    resolved: {
      resolvedModel: "m",
      resolvedProviderName: "p",
      provider: { capabilities: { streaming: true, }, },
    },
    prompt: { messages: [], },
    actorName: "Actress",
    chatStreaming: 1,
    ...overrides.tracking ? { tracking: overrides.tracking, } : {},
  } as unknown as Parameters<typeof callLlm>[0];
}

describeOrSkip("callLlm — streaming detector hygiene", () => {
  let unhandled: unknown[] = [];
  /**
   * @param reason
   */
  const listener = (reason: unknown,) => {
    unhandled.push(reason,);
  };
  beforeEach(() => {
    detectorStub.mockClear();
    detectorStub.mockImplementation(async () => "continue");
    unhandled = [];
    process.on("unhandledRejection", listener,);
  },);
  afterEach(() => {
    process.off("unhandledRejection", listener,);
  },);

  test("detector rejection is logged, never an unhandled rejection", async () => {
    detectorStub.mockImplementation(() => Promise.reject(new Error("detector boom",),));
    const result = await callLlm(makeOpts({ driver: contentChunk(["a", "b",],) as unknown as never, },),);

    // Yield enough for any dangling rejection to surface as unhandled.
    await new Promise((r,) => setTimeout(r, 25,));

    expect(result.content,).toBe("ab",);
    expect(unhandled,).toEqual([],);
  });

  test("aborted signal stops accumulation and buffer appends mid-stream", async () => {
    const controller = new AbortController();
    const appended: string[] = [];
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
        buffer: {
          append: (_kind, payload,) => {
            appended.push(payload,);
          },
        },
      },),
    );

    expect(result.content,).toBe("ok",);
    expect(result.content,).not.toContain("LEAK",);
    expect(appended.length,).toBe(1,);
    // Detector ran for the pre-cancel chunk only.
    expect(detectorStub.mock.calls.length,).toBe(1,);
    expect(detectorStub.mock.calls[0]?.[0],).toMatchObject({ attemptId: "att-1", },);
  });

  test("streaming without tracking skips the detector entirely", async () => {
    const result = await callLlm(makeOpts({ driver: contentChunk(["a",],) as unknown as never, },),);
    expect(result.content,).toBe("a",);
    expect(detectorStub.mock.calls.length,).toBe(0,);
  });
},);
