// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for callWithFailover cancellation semantics
 * (BUG-auto-gen-streaming-path-unhandled-rejection-abort-never-wire).
 *
 * A cancelled generation must NOT be treated as a provider failure: it must
 * propagate as GenerationCancelledError and must never restart the request on
 * a fallback provider. Genuine provider failures still fail over normally.
 */
import { describe, expect, mock, test, } from "bun:test";
import { CancelReason, CancelSource, } from "../../db/enums";
import { GenerationCancelledError, } from "../cancellation-actions/error";
import { callWithFailover, } from "./call-with-failover";
import type { GenerateRequest, GenerateResponse, LLMProvider, StreamHandler, } from "./types";

// Bun's mock.module is process-global and cannot be unmocked. Without
// --isolate, an earlier file (e.g. generate-route/non-stream.test.ts) may
// have replaced this module, which would silently test the stub instead of
// the real implementation. Probe for the real module: only the genuine
// callWithFailover throws "All providers failed" on an empty provider list.
let modulePristine = false;
try {
  await callWithFailover([], { model: "m", messages: [], params: {}, },);
} catch (error) {
  modulePristine = error instanceof Error && error.message.startsWith("All providers failed",);
}
const describeReal: (name: string, fn: () => void,) => void = modulePristine
  ? describe
  : (name, fn,) => describe.skip(name, fn,);

/** Minimal request shape for the failover tests. */
function makeReq(signal?: AbortSignal,): GenerateRequest {
  return {
    model: "m",
    messages: [],
    params: {},
    signal,
  } as unknown as GenerateRequest;
}

/**
 * @param streamImpl
 */
function makeProvider(
  streamImpl: (req: GenerateRequest, handler: StreamHandler,) => Promise<GenerateResponse>,
): LLMProvider {
  return {
    capabilities: { streaming: true, },
    stream: streamImpl,
    complete: async () => {
      throw new Error("unused",);
    },
    healthCheck: async () => ({ status: "ok" as const, }),
    listModels: async () => [],
  } as unknown as LLMProvider;
}

const okResponse = {
  content: "fallback won",
  thinking: undefined,
  finishReason: "stop",
  usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2, },
} satisfies GenerateResponse;

describeReal("callWithFailover — cancellation vs provider failure", () => {
  test("aborted stream rethrows the tracker's GenerationCancelledError without failover", async () => {
    const cancelled = new GenerationCancelledError(
      CancelReason.RepetitionDetected,
      CancelSource.AutoRepetition,
      "test detector",
    );
    const controller = new AbortController();
    controller.abort(cancelled,);

    const fallbackStream = mock(async () => okResponse);
    const providers = [
      {
        name: "primary",
        provider: makeProvider(async () => {
          throw new Error("AbortError: body stream aborted",);
        },),
      },
      { name: "fallback", provider: makeProvider(fallbackStream,), },
    ];

    let thrown: unknown;
    try {
      await callWithFailover(providers, makeReq(controller.signal,), () => {/* noop */},);
    } catch (error) {
      thrown = error;
    }

    expect(thrown,).toBeInstanceOf(GenerationCancelledError,);
    expect((thrown as GenerationCancelledError).reason,).toBe(CancelReason.RepetitionDetected,);
    // The cancellation must not restart generation on the fallback provider.
    expect(fallbackStream.mock.calls.length,).toBe(0,);
  });

  test("abort with a non-cancel reason wraps the throw as user cancel", async () => {
    const controller = new AbortController();
    controller.abort("client-disconnect",);

    let thrown: unknown;
    try {
      await callWithFailover(
        [{
          name: "primary",
          provider: makeProvider(async () => {
            throw new Error("socket closed",);
          },),
        },],
        makeReq(controller.signal,),
        () => {/* noop */},
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown,).toBeInstanceOf(GenerationCancelledError,);
    const gce = thrown as GenerationCancelledError;
    expect(gce.reason,).toBe(CancelReason.UserCancel,);
    expect(gce.source,).toBe(CancelSource.User,);
    expect(gce.cause,).toBeInstanceOf(Error,);
    expect((gce.cause as Error).message,).toBe("socket closed",);
  });

  test("genuine failures (no abort) still fail over to the next provider", async () => {
    const response = await callWithFailover(
      [
        {
          name: "primary",
          provider: makeProvider(async () => {
            throw new Error("500 upstream",);
          },),
        },
        { name: "fallback", provider: makeProvider(async () => okResponse), },
      ],
      makeReq(new AbortController().signal,),
      () => {/* noop */},
    );
    expect(response.content,).toBe("fallback won",);
  });
},);
