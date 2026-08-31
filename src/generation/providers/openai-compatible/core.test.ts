/**
 * Tests for the OpenAI-compatible generation dispatchers (complete + stream).
 */
import { describe, expect, test, } from "bun:test";
import type { GenerateRequest, StreamHandler, } from "../types";
import { ProviderAuthError, ProviderError, } from "../types";
import { completeDispatch, streamDispatch, } from "./core";
import type { OpenAiCompatibleState, } from "./types";

const state: OpenAiCompatibleState = {
  baseUrl: "https://provider.example",
  apiKey: "sk-test",
  defaultModel: "default-model",
  timeout: 5000,
  retries: 1,
  headers: {},
};

/**
 * @param overrides
 */
function req(overrides: Partial<GenerateRequest> = {},): GenerateRequest {
  return {
    model: "m1",
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
 * @param lines
 */
function sseResponse(lines: string[],): Response {
  return new Response(`${lines.join("\n",)}\n\n`, {
    headers: { "Content-Type": "text/event-stream", },
  },);
}

// ── completeDispatch ──────────────────────────────────────

describe("completeDispatch", () => {
  test("maps content, thinking, usage, and finish reason", async () => {
    await withMockFetch(
      async () =>
        jsonResponse({
          choices: [{
            message: { content: "Hello!", reasoning_content: "let me think", },
            finish_reason: "stop",
          },],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, },
        },),
      async () => {
        const result = await completeDispatch(state, req(),);
        expect(result.content,).toBe("Hello!",);
        expect(result.thinking,).toBe("let me think",);
        expect(result.finishReason,).toBe("stop",);
        expect(result.usage,).toEqual({ promptTokens: 10, completionTokens: 5, totalTokens: 15, },);
        expect(result.toolCalls,).toBeUndefined();
      },
    );
  });

  test("maps tool calls when present", async () => {
    await withMockFetch(
      async () =>
        jsonResponse({
          choices: [{
            message: {
              content: "",
              tool_calls: [
                { id: "call_1", type: "function", function: { name: "get_weather", arguments: '{"city":"x"}', }, },
              ],
            },
            finish_reason: "tool_calls",
          },],
        },),
      async () => {
        const result = await completeDispatch(state, req(),);
        expect(result.toolCalls,).toEqual([
          { id: "call_1", type: "function", function: { name: "get_weather", arguments: '{"city":"x"}', }, },
        ],);
        expect(result.finishReason,).toBe("error",);
      },
    );
  });

  test("maps length finish reason", async () => {
    await withMockFetch(
      async () => jsonResponse({ choices: [{ message: { content: "cut", }, finish_reason: "length", },], },),
      async () => {
        const result = await completeDispatch(state, req(),);
        expect(result.finishReason,).toBe("length",);
      },
    );
  });

  test("defaults usage counters to zero when omitted", async () => {
    await withMockFetch(
      async () => jsonResponse({ choices: [{ message: { content: "hi", }, finish_reason: "stop", },], },),
      async () => {
        const result = await completeDispatch(state, req(),);
        expect(result.usage,).toEqual({ promptTokens: 0, completionTokens: 0, totalTokens: 0, },);
      },
    );
  });

  test("throws a retryable 500 error on an empty choices list", async () => {
    await withMockFetch(
      async () => jsonResponse({ choices: [], },),
      async () => {
        try {
          await completeDispatch(state, req(),);
          expect.unreachable();
        } catch (error) {
          expect(error,).toBeInstanceOf(ProviderError,);
          expect((error as ProviderError).message,).toBe("Empty response from provider",);
          expect((error as ProviderError).statusCode,).toBe(500,);
          expect((error as ProviderError).retryable,).toBe(true,);
        }
      },
    );
  });

  test("throws an auth error on 401 responses", async () => {
    await withMockFetch(
      async () => jsonResponse({ error: { message: "bad key", }, }, 401,),
      async () => {
        try {
          await completeDispatch(state, req(),);
          expect.unreachable();
        } catch (error) {
          expect(error,).toBeInstanceOf(ProviderAuthError,);
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
    const lines = [
      'data: {"choices":[{"delta":{"content":"Hel"}}]}',
      'data: {"choices":[{"delta":{"content":"lo"}}]}',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":4,"completion_tokens":2,"total_tokens":6}}',
    ];

    await withMockFetch(
      async () => sseResponse(lines,),
      async () => {
        const result = await streamDispatch(state, req(), handler,);
        expect(result.content,).toBe("Hello",);
        expect(result.finishReason,).toBe("stop",);
        expect(result.usage,).toEqual({ promptTokens: 4, completionTokens: 2, totalTokens: 6, },);
      },
    );

    expect(events,).toEqual([
      "content:Hel",
      "content:lo",
      "done:stop",
    ],);
  });

  test("accumulates thinking deltas and emits thinking events", async () => {
    const events: string[] = [];
    const handler: StreamHandler = (chunk,) => {
      if (chunk.type === "thinking") { events.push(chunk.content ?? "",); }
    };
    const lines = [
      'data: {"choices":[{"delta":{"reasoning_content":"one"}}]}',
      'data: {"choices":[{"delta":{"reasoning_content":"two"}}]}',
      'data: {"choices":[{"delta":{},"finish_reason":"stop"}]}',
    ];

    await withMockFetch(
      async () => sseResponse(lines,),
      async () => {
        const result = await streamDispatch(state, req(), handler,);
        expect(result.thinking,).toBe("onetwo",);
      },
    );
    expect(events,).toEqual(["one", "two",],);
  });

  test("merges tool-call deltas across fragments, ordered by index", async () => {
    const toolCalls: string[] = [];
    const handler: StreamHandler = (chunk,) => {
      if (chunk.type === "tool_call" && chunk.toolCall) {
        toolCalls.push(
          `${chunk.toolCall.id}:${chunk.toolCall.function.name}:${chunk.toolCall.function.arguments}`,
        );
      }
    };
    const lines = [
      JSON.stringify({
        choices: [{
          delta: { tool_calls: [{ index: 1, id: "call_b", function: { name: "two", arguments: '{"b":', }, },], },
        },],
      },),
      JSON.stringify({
        choices: [{
          delta: { tool_calls: [{ index: 0, id: "call_a", function: { name: "one", arguments: '{"a":', }, },], },
        },],
      },),
      JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: "1}", }, },], }, },], },),
      JSON.stringify({ choices: [{ delta: {}, finish_reason: "tool_calls", },], },),
    ].map((payload,) => `data: ${payload}`);

    await withMockFetch(
      async () => sseResponse(lines,),
      async () => {
        const result = await streamDispatch(state, req(), handler,);
        expect(result.toolCalls,).toEqual([
          { id: "call_a", type: "function", function: { name: "one", arguments: '{"a":1}', }, },
          { id: "call_b", type: "function", function: { name: "two", arguments: '{"b":', }, },
        ],);
      },
    );
    expect(toolCalls,).toEqual([
      'call_a:one:{"a":1}',
      'call_b:two:{"b":',
    ],);
  });

  test("treats [DONE] as a stop without content", async () => {
    const events: string[] = [];
    const handler: StreamHandler = (chunk,) => {
      events.push(chunk.type,);
    };
    await withMockFetch(
      async () => sseResponse(["data: [DONE]",],),
      async () => {
        const result = await streamDispatch(state, req(), handler,);
        expect(result.content,).toBe("",);
        expect(result.finishReason,).toBe("stop",);
      },
    );
    expect(events,).toEqual(["done",],);
  });

  test("marks the stream cancelled when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort("stopped",);
    await withMockFetch(
      async () => sseResponse(['data: {"choices":[{"delta":{"content":"x"}}]}',],),
      async () => {
        const result = await streamDispatch(state, req({ signal: controller.signal, },), () => {},);
        expect(result.finishReason,).toBe("cancelled",);
      },
    );
  });

  test("ignores invalid and non-data lines", async () => {
    const lines = [
      "event: message",
      "data: {not json",
      'data: {"choices":[{"delta":{"content":"ok"}}]}',
    ];
    await withMockFetch(
      async () => sseResponse(lines,),
      async () => {
        const result = await streamDispatch(state, req(), () => {},);
        expect(result.content,).toBe("ok",);
        expect(result.finishReason,).toBe("stop",);
      },
    );
  });

  test("throws the mapped error for non-ok responses", async () => {
    await withMockFetch(
      async () => jsonResponse({ error: { message: "nope", }, }, 400,),
      async () => {
        try {
          await streamDispatch(state, req(), () => {},);
          expect.unreachable();
        } catch (error) {
          expect(error,).toBeInstanceOf(ProviderError,);
          expect((error as ProviderError).statusCode,).toBe(400,);
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
