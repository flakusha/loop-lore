// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Once a provider has streamed a chunk to the caller, failover must stop:
 * a fallback would append a second, complete reply after the partial one.
 */
import { describe, expect, test, } from "bun:test";
import { callWithFailover, } from "./call-with-failover";
import type { ChunkEvent, GenerateRequest, GenerateResponse, LLMProvider, } from "./types";

function reply(): GenerateResponse {
  return {
    content: "fallback answered",
    finishReason: "stop",
    usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2, },
  };
}

/** Stub that either succeeds or throws after one emitted chunk. */
function stub(calls: string[], emitThenThrow: boolean,): LLMProvider {
  return {
    capabilities: { streaming: true, },
    complete: async () => reply(),
    stream: async (_req: GenerateRequest, handler: (chunk: ChunkEvent,) => void,) => {
      calls.push("called",);
      if (emitThenThrow) {
        handler({ type: "content", content: "partial", },);
        throw new Error("mid-stream failure",);
      }

      handler({ type: "content", content: "full", },);
      return reply();
    },
    healthCheck: async () => ({ status: "ok" as const, }),
    listModels: async () => [],
  } as unknown as LLMProvider;
}

describe("callWithFailover — partial stream", () => {
  test("a provider that emitted a chunk is not failed over", async () => {
    const primaryCalls: string[] = [];
    const fallbackCalls: string[] = [];
    const chunks: ChunkEvent[] = [];
    let thrown: unknown;
    try {
      await callWithFailover(
        [
          { name: "cfw-primary", provider: stub(primaryCalls, true,), },
          { name: "cfw-fallback", provider: stub(fallbackCalls, false,), },
        ],
        { model: "m", messages: [], params: {}, },
        (chunk,) => {
          chunks.push(chunk,);
        },
      );
    } catch (error) {
      thrown = error;
    }

    expect((thrown as Error | undefined)?.message,).toBe("mid-stream failure",);
    expect(chunks,).toEqual([{ type: "content", content: "partial", },],);
    expect(primaryCalls,).toEqual(["called",],);
    expect(fallbackCalls,).toEqual([],);
  });
});
