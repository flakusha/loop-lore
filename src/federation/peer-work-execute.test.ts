// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Coverage for `createLocalPeerWorkExecutor` — the receiver-side hop that
 * resolves a peer-requested provider profile against the LOCAL registry.
 *
 * The executor is driven through its public `run()` with a registered stub
 * provider, never through a real LLM: the failover chain, the per-attempt id,
 * and the circuit-breaker seam are the behaviour under test.
 */
import { afterEach, describe, expect, test, } from "bun:test";
import type { Config, } from "../config/schema";
import { PeerWorkloadClass, } from "../db/enums";
import { registerProvider, unregisterProvider, } from "../generation/providers/registry";
import type { ChunkEvent, GenerateResponse, LLMProvider, } from "../generation/providers/types";
import { createLocalPeerWorkExecutor, } from "./peer-work-execute";
import type { PeerWorkMessage, PeerWorkRunRequest, } from "./peer-work-wire";

const STUB = "peer-exec-stub";

/** A provider that records what it was handed and returns canned chunks. */
function stubProvider(chunks: ChunkEvent[] = [{ type: "content", content: "ok", },],) {
  const calls: {
    req: { model: string; params: Record<string, unknown> };
    handler: ((chunk: ChunkEvent,) => void) | undefined;
  }[] = [];

  return {
    calls,
    provider: {
      capabilities: {
        type: "openai-compatible",
        label: "stub",
        text: true,
        image: false,
        embeddings: false,
        streaming: true,
        tools: false,
        thinking: false,
      },
      complete: async (req: { model: string },) => {
        calls.push({ req: { model: req.model, params: {}, }, handler: undefined, },);
        return stubResponse(chunks,);
      },
      stream: async (
        req: { model: string; params: Record<string, unknown> },
        handler: (chunk: ChunkEvent,) => void,
      ) => {
        calls.push({ req, handler, },);
        for (const chunk of chunks) { handler(chunk,); }
        return stubResponse(chunks,);
      },
      healthCheck: async () => {
        const result: { status: "ok"; model: string } = { status: "ok", model: "stub-model", };
        return result;
      },
      listModels: async () => [],
    } satisfies LLMProvider,
  };
}

/** @returns {GenerateResponse} */
function stubResponse(chunks: ChunkEvent[],): GenerateResponse {
  const content = chunks.filter((c,) => c.type === "content" && c.content).map((c,) => c.content ?? "").join("",);
  return {
    content,
    finishReason: "stop",
    usage: { promptTokens: 1, completionTokens: content.length, totalTokens: 1 + content.length, },
  };
}

/** @returns {Config} */
function testConfig(): Config {
  return {
    providers: {},
    defaultProvider: STUB,
    defaultModels: {},
  } as unknown as Config;
}

const MESSAGES: PeerWorkMessage[] = [{ role: "user", content: "hi", },];

/** A minimal `PeerWorkRunRequest` for the stub provider. */
const REQUEST: PeerWorkRunRequest = {
  workloadClass: PeerWorkloadClass.Chat,
  assignmentKey: "peer-work:assignment-key",
  provider: STUB,
  model: "stub-model",
  messages: MESSAGES,
};

afterEach(() => {
  unregisterProvider(STUB,);
},);

describe("createLocalPeerWorkExecutor", () => {
  test("runs the local provider and returns its assembled response", async () => {
    const { provider, calls, } = stubProvider([
      { type: "content", content: "hello ", },
      { type: "content", content: "world", },
      { type: "done", finishReason: "stop", },
    ],);

    registerProvider(STUB, provider,);
    const executor = createLocalPeerWorkExecutor({ config: testConfig(), },);

    const received: ChunkEvent[] = [];
    const controller = new AbortController();
    const response = await executor.run({
      request: REQUEST,
      onChunk: (chunk,) => {
        received.push(chunk,);
      },
      signal: controller.signal,
    },);

    expect(response.content,).toBe("hello world",);
    expect(response.finishReason,).toBe("stop",);
    expect(received.filter((c,) => c.type === "content").map((c,) => c.content ?? "").join("",),).toBe("hello world",);
    // The scheduler streams through the handler.
    expect(calls,).toHaveLength(1,);
    expect(calls[0]?.handler,).toBeDefined();
    expect(calls[0]?.req.model,).toBe(REQUEST.model,);
  });

  test("a provider the registry cannot resolve is refused", async () => {
    const executor = createLocalPeerWorkExecutor({ config: testConfig(), },);
    const controller = new AbortController();

    await expect(
      executor.run({
        request: { ...REQUEST, provider: "no-such-provider", },
        onChunk: () => {},
        signal: controller.signal,
      },),
    ).rejects.toThrow(/no local provider resolved/,);
  });

  test("generation params are forwarded to the provider request", async () => {
    const { provider, calls, } = stubProvider([{ type: "content", content: "x", },],);
    registerProvider(STUB, provider,);
    const executor = createLocalPeerWorkExecutor({ config: testConfig(), },);

    await executor.run({
      request: { ...REQUEST, params: { temperature: 0.5, maxTokens: 42, }, },
      onChunk: () => {},
      signal: new AbortController().signal,
    },);

    const params = calls[0]?.req.params as Record<string, unknown>;
    expect(params.temperature,).toBe(0.5,);
    expect(params.maxTokens,).toBe(42,);
  });

  test("an already-aborted signal does not fail the attempt", async () => {
    const { provider, } = stubProvider([{ type: "content", content: "x", },],);
    registerProvider(STUB, provider,);
    const executor = createLocalPeerWorkExecutor({ config: testConfig(), },);
    const controller = new AbortController();
    controller.abort();

    const response = await executor.run({ request: REQUEST, onChunk: () => {}, signal: controller.signal, },);

    // The executor does not special-case a pre-aborted signal; the scheduler
    // owns that behaviour. The call itself succeeds.
    expect(response.content,).toBe("x",);
  });
});
