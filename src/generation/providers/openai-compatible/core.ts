// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Core generation dispatchers ─────────────────────────
//
// Extracted from the `OpenAiCompatibleProvider` class body. Each dispatcher is
// threaded with an explicit `state` handle (the class's private fields).

import type {
  GenerateRequest,
  GenerateResponse,
  StreamHandler,
  ToolCall,
} from "../types";
import { ProviderError, } from "../types";
import { buildBody, fetchRaw, fetchWithRetry, handleErrorResponse, mapFinishReason, } from "./http";
import { parseSSELine, } from "./sse";
import type { OpenAiCompatibleState, OpenAIResponse, OpenAIStreamChunk, } from "./types";

export async function completeDispatch(
  state: OpenAiCompatibleState,
  req: GenerateRequest,
): Promise<GenerateResponse> {
  const body = buildBody(state, req, false,);
  const response = await fetchWithRetry(state, "/chat/completions", body, req.signal, req.apiKey,);
  const data = response as OpenAIResponse;

  const choice = data.choices?.[0];
  if (!choice) {
    throw new ProviderError("Empty response from provider", undefined, 500, true,);
  }

  const toolCalls = choice.message?.tool_calls
    ? Array.from(choice.message.tool_calls, (tc,) => ({
      id: tc.id,
      type: tc.type,
      function: { name: tc.function.name, arguments: tc.function.arguments, },
    }),)
    : undefined;

  return {
    content: choice.message?.content ?? "",
    thinking: choice.message?.reasoning_content,
    toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
    finishReason: mapFinishReason(choice.finish_reason,),
    usage: {
      promptTokens: data.usage?.prompt_tokens ?? 0,
      completionTokens: data.usage?.completion_tokens ?? 0,
      totalTokens: data.usage?.total_tokens ?? 0,
    },
  };
}

export async function streamDispatch(
  state: OpenAiCompatibleState,
  req: GenerateRequest,
  handler: StreamHandler,
): Promise<GenerateResponse> {
  const body = buildBody(state, req, true,);
  const signal = req.signal;

  const url = new URL(`${state.baseUrl}/chat/completions`,);
  const response = await fetchRaw(state, url.href, body, signal, req.apiKey,);

  if (!response.ok) {
    await handleErrorResponse(response,);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new ProviderError("No response body for streaming", undefined, 500, true,);
  }

  const decoder = new TextDecoder();
  let buffer = "";
  const acc: StreamAccum = {
    fullContent: "",
    fullThinking: "",
    toolCallAccum: new Map(),
    finishReason: "stop",
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, },
  };

  try {
    while (true) {
      const { done, value, } = await (reader.read() as Promise<{ done: boolean; value?: Uint8Array }>);
      if (done) { break; }

      buffer += decoder.decode(value, { stream: true, },);
      const lines = buffer.split("\n",);
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (applyStreamLine(line, signal, handler, acc,)) { break; }
      }
      if (signal?.aborted) { break; }
    }
  } catch (error) {
    if (signal?.aborted) {
      acc.finishReason = "cancelled";
    } else {
      throw error;
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* reader already released */
    }
  }

  const toolCalls = collectToolCalls(acc.toolCallAccum,);

  if (toolCalls) {
    for (const tc of toolCalls) {
      handler({ type: "tool_call", toolCall: tc, },);
    }
  }

  return {
    content: acc.fullContent,
    thinking: acc.fullThinking || undefined,
    toolCalls,
    finishReason: acc.finishReason,
    usage: acc.usage,
  };
}

/**
 * Flatten accumulated per-index tool-call fragments into a sorted list.
 *
 * @param accum - Tool-call fragments keyed by stream index
 * @returns Sorted tool calls, or `undefined` when none were accumulated
 */
function collectToolCalls(
  accum: Map<number, { id?: string; type?: "function"; function: { name?: string; arguments: string } }>,
): ToolCall[] | undefined {
  if (accum.size === 0) { return undefined; }
  return Array.from(
    [...accum,].sort(([a,], [b,],) => a - b),
    ([, v,],) => ({
      id: v.id ?? "",
      type: v.type ?? ("function" as const),
      function: { name: v.function.name ?? "", arguments: v.function.arguments, },
    }),
  );
}

/**
 * Merge a delta tool-call fragment into the accumulator.
 *
 * @param acc - Stream accumulator
 * @param tc - Tool-call delta fragment from the current SSE chunk
 */
function accumulateToolCall(
  acc: StreamAccum,
  tc: { index: number; id?: string; type?: "function"; function?: { name?: string; arguments?: string } },
): void {
  const existing = acc.toolCallAccum.get(tc.index,) ?? { function: { arguments: "", }, };
  if (tc.id) { existing.id = tc.id; }
  if (tc.type) { existing.type = tc.type; }
  if (tc.function?.name) { existing.function.name = tc.function.name; }
  if (tc.function?.arguments) { existing.function.arguments += tc.function.arguments; }
  acc.toolCallAccum.set(tc.index, existing,);
}

/** Accumulated stream state threaded through per-line processing. */
interface StreamAccum {
  fullContent: string;
  fullThinking: string;
  toolCallAccum: Map<
    number,
    { id?: string; type?: "function"; function: { name?: string; arguments: string } }
  >;
  finishReason: "stop" | "length" | "error" | "cancelled";
  usage: { promptTokens: number; completionTokens: number; totalTokens: number };
}

/**
 * Process a single SSE line from a streaming chat-completions response.
 *
 * @param line - Raw SSE line (event name or data payload)
 * @param signal - Abort signal; when aborted the stream is marked cancelled
 * @param handler - Stream event callback
 * @param acc - Mutable accumulators (content, tool calls, finish reason, usage)
 * @returns `true` when the caller should stop reading further lines
 */
function applyStreamLine(
  line: string,
  signal: AbortSignal | undefined,
  handler: StreamHandler,
  acc: StreamAccum,
): boolean {
  if (signal?.aborted) {
    acc.finishReason = "cancelled";
    return true;
  }

  const parsed = parseSSELine(line,);
  if (!parsed) { return false; }
  if (parsed._done === "true") {
    handler({ type: "done", finishReason: "stop", },);
    return false;
  }

  const data = parsed as unknown as OpenAIStreamChunk;
  const delta = data.choices?.[0]?.delta;
  if (!delta) { return false; }

  if (delta.content) {
    acc.fullContent += delta.content;
    handler({ type: "content", content: delta.content, },);
  }
  if (delta.reasoning_content) {
    acc.fullThinking += delta.reasoning_content;
    handler({ type: "thinking", content: delta.reasoning_content, },);
  }
  if (delta.tool_calls) {
    for (const tc of delta.tool_calls) {
      accumulateToolCall(acc, tc,);
    }
  }

  const finish = data.choices?.[0]?.finish_reason;
  if (finish && finish !== "null") {
    acc.finishReason = mapFinishReason(finish,);
    if (data.usage) {
      acc.usage = {
        promptTokens: data.usage.prompt_tokens ?? 0,
        completionTokens: data.usage.completion_tokens ?? 0,
        totalTokens: data.usage.total_tokens ?? 0,
      };
    }
    handler({ type: "done", finishReason: acc.finishReason, },);
  }
  return false;
}
