/**
 * Tests for the Ollama-native generation dispatchers (complete + stream).
 *
 * Mirrors the openai-compatible provider's test style: mock `fetch`, drive the
 * dispatchers directly, assert mapped output + handler events.
 */
import { describe, expect, test, } from "bun:test";
import type { GenerateRequest, StreamHandler, } from "../types";
import { ProviderError, } from "../types";
import { completeDispatch, streamDispatch, } from "./core";
import type { OllamaNativeState, } from "./types";

const state: OllamaNativeState = {
  baseUrl: "http://localhost:11434",
  apiKey: undefined,
  defaultModel: "llama3.2",
  timeout: 5000,
  retries: 1,
  headers: {},
};

/**
 * @param overrides
 */
function req(overrides: Partial<GenerateRequest> = {},): GenerateRequest {
  return {
    model: "llama3.2",
    messages: [{ role: "user", content: "hi", },],
    params: {},
    ...overrides,
  };
}

type FetchHandler = (url: string, init: RequestInit,) => Response | Promise<Response>;

/**
 * @param handler
 * @param fn
 */
async function withMockFetch(handler: FetchHandler, fn: () => Promise<void>,): Promise<void> {
  const originalFetch = globalThis.fetch;

  (globalThis as Record<string, unknown>).fetch = handler;
  try {
    return await fn();
  } finally {
    (globalThis as Record<string, unknown>).fetch = originalFetch;
  }
}

/**
 * @param body
 * @param status
 */
function jsonResponse(body: unknown, status = 200,): Response {
  return Response.json(body, {
    status,
    headers: { "Content-Type": "application/json", },
  },);
}

/**
 * @param chunks
 */
function streamResponse(chunks: unknown[],): Response {
  // Ollama streams one JSON object per line (no SSE prefix, no [DONE]).
  const body = `${chunks.map((c,) => JSON.stringify(c,)).join("\n",)}\n`;
  return new Response(body, {
    headers: { "Content-Type": "application/json", },
  },);
}

// ── completeDispatch ──────────────────────────────────────

describe("completeDispatch", () => {
  test("maps content, usage, and finish reason", async () => {
    await withMockFetch(
      async () =>
        jsonResponse({
          model: "llama3.2",
          message: { role: "assistant", content: "Hello!", },
          done: true,
          done_reason: "stop",
          prompt_eval_count: 10,
          eval_count: 5,
        },),
      async () => {
        const result = await completeDispatch(state, req(),);
        expect(result.content,).toBe("Hello!",);
        expect(result.finishReason,).toBe("stop",);
        expect(result.usage,).toEqual({ promptTokens: 10, completionTokens: 5, totalTokens: 15, },);
        expect(result.toolCalls,).toBeUndefined();
      },
    );
  });

  test("maps tool calls (stringifying object arguments)", async () => {
    await withMockFetch(
      async () =>
        jsonResponse({
          model: "llama3.2",
          message: {
            role: "assistant",
            tool_calls: [{ function: { name: "get_weather", arguments: { city: "x", }, }, },],
          },
          done: true,
        },),
      async () => {
        const result = await completeDispatch(state, req(),);
        expect(result.toolCalls,).toEqual([
          { id: "call_0", type: "function", function: { name: "get_weather", arguments: '{"city":"x"}', }, },
        ],);
      },
    );
  });

  test("throws a retryable 500 error on an empty response", async () => {
    await withMockFetch(
      async () => jsonResponse({ done: true, },),
      async () => {
        try {
          await completeDispatch(state, req(),);
          expect.unreachable();
        } catch (error) {
          expect(error,).toBeInstanceOf(ProviderError,);
          expect((error as ProviderError).message,).toBe("Empty response from Ollama",);
          expect((error as ProviderError).statusCode,).toBe(500,);
          expect((error as ProviderError).retryable,).toBe(true,);
        }
      },
    );
  });

  test("throws an auth error on 401 responses", async () => {
    await withMockFetch(
      async () => jsonResponse({ error: "unauthorized", }, 401,),
      async () => {
        try {
          await completeDispatch(state, req(),);
          expect.unreachable();
        } catch (error) {
          expect(error,).toBeInstanceOf(ProviderError,);
          expect((error as ProviderError).statusCode,).toBe(401,);
          expect((error as ProviderError).retryable,).toBe(false,);
        }
      },
    );
  });
});

// ── streamDispatch ────────────────────────────────────────

describe("streamDispatch", () => {
  test("accumulates content deltas and emits content + done events", async () => {
    const events: string[] = [];
    const handler: StreamHandler = (chunk,) => {
      events.push(`${chunk.type}:${chunk.content ?? chunk.finishReason ?? ""}`,);
    };
    const chunks = [
      { model: "llama3.2", message: { role: "assistant", content: "Hel", }, done: false, },
      { model: "llama3.2", message: { role: "assistant", content: "lo", }, done: false, },
      { model: "llama3.2", message: {}, done: true, done_reason: "stop", prompt_eval_count: 4, eval_count: 2, },
    ];

    await withMockFetch(
      async () => streamResponse(chunks,),
      async () => {
        const result = await streamDispatch(state, req(), handler,);
        expect(result.content,).toBe("Hello",);
        expect(result.finishReason,).toBe("stop",);
        expect(result.usage,).toEqual({ promptTokens: 4, completionTokens: 2, totalTokens: 6, },);
      },
    );

    expect(events,).toEqual(["content:Hel", "content:lo", "done:stop",],);
  });

  test("accumulates tool calls across chunks", async () => {
    const toolCalls: string[] = [];
    const handler: StreamHandler = (chunk,) => {
      if (chunk.type === "tool_call" && chunk.toolCall) {
        toolCalls.push(`${chunk.toolCall.function.name}:${chunk.toolCall.function.arguments}`,);
      }
    };
    const chunks = [
      {
        model: "llama3.2",
        message: { tool_calls: [{ function: { name: "get_weather", arguments: { city: "x", }, }, },], },
        done: false,
      },
      { model: "llama3.2", message: {}, done: true, done_reason: "stop", },
    ];

    await withMockFetch(
      async () => streamResponse(chunks,),
      async () => {
        const result = await streamDispatch(state, req(), handler,);
        expect(result.toolCalls,).toEqual([
          { id: "call_0", type: "function", function: { name: "get_weather", arguments: '{"city":"x"}', }, },
        ],);
      },
    );
    expect(toolCalls,).toEqual(['get_weather:{"city":"x"}',],);
  });

  test("marks the stream cancelled when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort("stopped",);
    await withMockFetch(
      async () => streamResponse([{ model: "llama3.2", message: { content: "x", }, done: false, },],),
      async () => {
        const result = await streamDispatch(state, req({ signal: controller.signal, },), () => {},);
        expect(result.finishReason,).toBe("cancelled",);
      },
    );
  });

  test("ignores invalid JSON lines and blank lines", async () => {
    const body = 'not json\n\n{"model":"llama3.2","message":{"content":"ok"},"done":true,"done_reason":"stop"}\n';
    await withMockFetch(
      async () => new Response(body, { headers: { "Content-Type": "application/json", }, },),
      async () => {
        const result = await streamDispatch(state, req(), () => {},);
        expect(result.content,).toBe("ok",);
        expect(result.finishReason,).toBe("stop",);
      },
    );
  });

  test("throws the mapped error for non-ok responses", async () => {
    await withMockFetch(
      async () => jsonResponse({ error: "model not found", }, 404,),
      async () => {
        try {
          await streamDispatch(state, req(), () => {},);
          expect.unreachable();
        } catch (error) {
          expect(error,).toBeInstanceOf(ProviderError,);
          expect((error as ProviderError).statusCode,).toBe(404,);
          expect((error as ProviderError).retryable,).toBe(false,);
        }
      },
    );
  });

  test("throws when the response has no body", async () => {
    await withMockFetch(
      async () => new Response(null, { status: 200, },),
      async () => {
        try {
          await streamDispatch(state, req(), () => {},);
          expect.unreachable();
        } catch (error) {
          expect(error,).toBeInstanceOf(ProviderError,);
          expect((error as ProviderError).message,).toBe("No response body for streaming",);
        }
      },
    );
  });
});
