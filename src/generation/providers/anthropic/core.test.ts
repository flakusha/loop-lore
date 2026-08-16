/**
 * Tests for the Anthropic generation dispatchers (complete + stream).
 *
 * Mirrors the openai-compatible provider's test style: mock `fetch`, drive the
 * dispatchers directly, assert mapped output + handler events.
 */
import { describe, expect, test, } from "bun:test";
import type { GenerateRequest, StreamHandler, } from "../types";
import { ProviderError, } from "../types";
import { completeDispatch, streamDispatch, } from "./core";
import type { AnthropicState, } from "./types";

const state: AnthropicState = {
  baseUrl: "https://api.anthropic.com",
  apiKey: "sk-ant-test",
  defaultModel: "claude-3-5-sonnet",
  timeout: 5000,
  retries: 1,
  headers: {},
};

function req(overrides: Partial<GenerateRequest> = {},): GenerateRequest {
  return {
    model: "claude-3-5-sonnet",
    messages: [{ role: "user", content: "hi", },],
    params: {},
    ...overrides,
  };
}

type FetchHandler = (url: string, init: RequestInit,) => Response | Promise<Response>;

async function withMockFetch(handler: FetchHandler, fn: () => Promise<void>,): Promise<void> {
  const originalFetch = globalThis.fetch;
  // eslint-disable-next-line unicorn/no-global-object-property-assignment
  (globalThis as Record<string, unknown>).fetch = handler;
  try {
    return await fn();
  } finally {
    // eslint-disable-next-line unicorn/no-global-object-property-assignment
    (globalThis as Record<string, unknown>).fetch = originalFetch;
  }
}

function jsonResponse(body: unknown, status = 200,): Response {
  return Response.json(body, {
    status,
    headers: { "Content-Type": "application/json", },
  },);
}

/** Build an Anthropic SSE body (event:/data: line pairs). */
function sseResponse(events: [string, unknown,][],): Response {
  const lines = events.flatMap(([name, data,],) => [`event: ${name}`, `data: ${JSON.stringify(data,)}`,]);
  return new Response(`${lines.join("\n",)}\n\n`, {
    headers: { "Content-Type": "text/event-stream", },
  },);
}

// ── completeDispatch ──────────────────────────────────────

describe("completeDispatch", () => {
  test("maps text blocks, usage, and finish reason", async () => {
    await withMockFetch(
      async () =>
        jsonResponse({
          content: [{ type: "text", text: "Hello Claude!", },],
          stop_reason: "end_turn",
          usage: { input_tokens: 10, output_tokens: 5, },
        },),
      async () => {
        const result = await completeDispatch(state, req(),);
        expect(result.content,).toBe("Hello Claude!",);
        expect(result.finishReason,).toBe("stop",);
        expect(result.usage,).toEqual({ promptTokens: 10, completionTokens: 5, totalTokens: 15, },);
        expect(result.toolCalls,).toBeUndefined();
      },
    );
  });

  test("maps tool_use blocks to tool calls", async () => {
    await withMockFetch(
      async () =>
        jsonResponse({
          content: [{
            type: "tool_use",
            id: "toolu_1",
            name: "get_weather",
            input: { city: "x", },
          },],
          stop_reason: "tool_use",
          usage: { input_tokens: 4, output_tokens: 2, },
        },),
      async () => {
        const result = await completeDispatch(state, req(),);
        expect(result.toolCalls,).toEqual([
          { id: "toolu_1", type: "function", function: { name: "get_weather", arguments: '{"city":"x"}', }, },
        ],);
        expect(result.finishReason,).toBe("stop",);
        expect(result.content,).toBe("",);
      },
    );
  });

  test("maps max_tokens finish reason", async () => {
    await withMockFetch(
      async () =>
        jsonResponse({
          content: [{ type: "text", text: "cut", },],
          stop_reason: "max_tokens",
          usage: { input_tokens: 4, output_tokens: 8, },
        },),
      async () => {
        const result = await completeDispatch(state, req(),);
        expect(result.finishReason,).toBe("length",);
      },
    );
  });

  test("concatenates multiple text blocks", async () => {
    await withMockFetch(
      async () =>
        jsonResponse({
          content: [{ type: "text", text: "one", }, { type: "text", text: "two", },],
          stop_reason: "end_turn",
          usage: { input_tokens: 1, output_tokens: 1, },
        },),
      async () => {
        const result = await completeDispatch(state, req(),);
        expect(result.content,).toBe("onetwo",);
      },
    );
  });
});

// ── streamDispatch ────────────────────────────────────────

describe("streamDispatch", () => {
  test("accumulates text deltas and emits content + done events", async () => {
    const events: string[] = [];
    const handler: StreamHandler = (chunk,) => {
      events.push(`${chunk.type}:${chunk.content ?? chunk.finishReason ?? ""}`,);
    };
    const streamed = [
      ["message_start", { type: "message_start", message: { usage: { input_tokens: 10, }, }, },],
      ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "Hel", }, },],
      ["content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "lo", }, },],
      ["message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", }, usage: { output_tokens: 5, }, },],
    ] as [string, unknown,][];

    await withMockFetch(
      async () => sseResponse(streamed,),
      async () => {
        const result = await streamDispatch(state, req(), handler,);
        expect(result.content,).toBe("Hello",);
        expect(result.finishReason,).toBe("stop",);
        expect(result.usage,).toEqual({ promptTokens: 10, completionTokens: 5, totalTokens: 15, },);
      },
    );

    expect(events,).toEqual(["content:Hel", "content:lo", "done:stop",],);
  });

  test("accumulates thinking deltas and emits thinking events", async () => {
    const events: string[] = [];
    const handler: StreamHandler = (chunk,) => {
      if (chunk.type === "thinking") { events.push(chunk.content ?? "",); }
    };
    const streamed = [
      ["content_block_delta", {
        type: "content_block_delta",
        index: 0,
        delta: { type: "thinking_delta", thinking: "one", },
      },],
      ["content_block_delta", {
        type: "content_block_delta",
        index: 0,
        delta: { type: "thinking_delta", thinking: "two", },
      },],
      ["message_delta", { type: "message_delta", delta: { stop_reason: "end_turn", }, },],
    ] as [string, unknown,][];

    await withMockFetch(
      async () => sseResponse(streamed,),
      async () => {
        const result = await streamDispatch(state, req(), handler,);
        expect(result.thinking,).toBe("onetwo",);
      },
    );
    expect(events,).toEqual(["one", "two",],);
  });

  test("accumulates tool-use input across input_json_delta fragments", async () => {
    const toolCalls: string[] = [];
    const handler: StreamHandler = (chunk,) => {
      if (chunk.type === "tool_call" && chunk.toolCall) {
        toolCalls.push(`${chunk.toolCall.function.name}:${chunk.toolCall.function.arguments}`,);
      }
    };
    const streamed = [
      ["content_block_start", {
        type: "content_block_start",
        index: 0,
        content_block: { type: "tool_use", id: "toolu_1", name: "get_weather", },
      },],
      ["content_block_delta", {
        type: "content_block_delta",
        index: 0,
        delta: { type: "input_json_delta", partial_json: '{"city"', },
      },],
      ["content_block_delta", {
        type: "content_block_delta",
        index: 0,
        delta: { type: "input_json_delta", partial_json: ':"x"}', },
      },],
      ["message_delta", { type: "message_delta", delta: { stop_reason: "tool_use", }, },],
    ] as [string, unknown,][];

    await withMockFetch(
      async () => sseResponse(streamed,),
      async () => {
        const result = await streamDispatch(state, req(), handler,);
        expect(result.toolCalls,).toEqual([
          { id: "toolu_1", type: "function", function: { name: "get_weather", arguments: '{"city":"x"}', }, },
        ],);
      },
    );
    expect(toolCalls,).toEqual(['get_weather:{"city":"x"}',],);
  });

  test("marks the stream cancelled when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort("stopped",);
    await withMockFetch(
      async () =>
        sseResponse([["content_block_delta", {
          type: "content_block_delta",
          index: 0,
          delta: { type: "text_delta", text: "x", },
        },],],),
      async () => {
        const result = await streamDispatch(state, req({ signal: controller.signal, },), () => {},);
        expect(result.finishReason,).toBe("cancelled",);
      },
    );
  });

  test("ignores missing and invalid event/data pairs", async () => {
    const body =
      'event: message_start\ndata: {not json\nevent: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"ok"}}\n';
    await withMockFetch(
      async () => new Response(`${body}\n`, { headers: { "Content-Type": "text/event-stream", }, },),
      async () => {
        const result = await streamDispatch(state, req(), () => {},);
        expect(result.content,).toBe("ok",);
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
