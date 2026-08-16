// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Core generation dispatchers (Ollama native) ─────────
//
// Threaded with an explicit `state` handle (the class's private fields),
// mirroring the openai-compatible provider's dispatcher structure.

import { safeJsonParse, safeJsonStringify, } from "../../../utils";
import type { GenerateRequest, GenerateResponse, StreamHandler, ToolCall, } from "../types";
import { ProviderError, } from "../types";
import { buildBody, fetchRaw, fetchWithRetry, handleErrorResponse, mapFinishReason, } from "./http";
import type { OllamaNativeState, OllamaStreamChunk, OllamaToolCallDTO, } from "./types";

export async function completeDispatch(
  state: OllamaNativeState,
  req: GenerateRequest,
): Promise<GenerateResponse> {
  const body = buildBody(state, req, false,);
  const data = (await fetchWithRetry(
    state,
    "/api/chat",
    body,
    req.signal,
    req.apiKey,
  )) as {
    message?: { content?: string; tool_calls?: OllamaToolCallDTO[] };
    done_reason?: string;
    prompt_eval_count?: number;
    eval_count?: number;
  };

  const message = data.message;
  if (!message) {
    throw new ProviderError("Empty response from Ollama", undefined, 500, true,);
  }

  let toolCalls: ToolCall[] | undefined;
  if (message.tool_calls && message.tool_calls.length > 0) {
    toolCalls = Array.from(message.tool_calls, (tc, i,) => ({
      id: `call_${i}`,
      type: "function",
      function: {
        name: tc.function.name,
        arguments: safeJsonStringifyOr(tc.function.arguments,),
      },
    }),);
  }

  return {
    content: message.content ?? "",
    toolCalls: toolCalls && toolCalls.length > 0 ? toolCalls : undefined,
    finishReason: toolCalls && toolCalls.length > 0 ? "stop" : mapFinishReason(data.done_reason,),
    usage: {
      promptTokens: data.prompt_eval_count ?? 0,
      completionTokens: data.eval_count ?? 0,
      totalTokens: (data.prompt_eval_count ?? 0) + (data.eval_count ?? 0),
    },
  };
}

interface StreamAccum {
  fullContent: string;
  toolCallsAccum: Map<number, ToolCall>;
  nextToolIndex: number;
  finishReason: GenerateResponse["finishReason"];
  usage: GenerateResponse["usage"];
}

export async function streamDispatch(
  state: OllamaNativeState,
  req: GenerateRequest,
  handler: StreamHandler,
): Promise<GenerateResponse> {
  const body = buildBody(state, req, true,);
  const signal = req.signal;

  const url = new URL(`${state.baseUrl}/api/chat`,);
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
    toolCallsAccum: new Map(),
    nextToolIndex: 0,
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
      if (signal?.aborted) {
        acc.finishReason = "cancelled";
        break;
      }
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

  const toolCalls = acc.toolCallsAccum.size > 0 ? Array.from(acc.toolCallsAccum.values(),) : undefined;
  if (toolCalls) {
    for (const tc of toolCalls) {
      handler({ type: "tool_call", toolCall: tc, },);
    }
  }

  return {
    content: acc.fullContent,
    toolCalls,
    finishReason: acc.finishReason,
    usage: acc.usage,
  };
}

/**
 * Process a single raw JSON line from the Ollama stream.
 *
 * @param line - One newline-delimited JSON chunk
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
  if (line.trim() === "") { return false; }
  if (signal?.aborted) {
    acc.finishReason = "cancelled";
    return true;
  }

  const parsed = safeJsonParse<OllamaStreamChunk>(line,);
  if (!parsed.ok) { return false; }
  const chunk = parsed.value;

  const delta = chunk.message?.content;
  if (delta) {
    acc.fullContent += delta;
    handler({ type: "content", content: delta, },);
  }

  if (chunk.message?.tool_calls) {
    for (const tc of chunk.message.tool_calls) {
      const index = acc.nextToolIndex++;
      acc.toolCallsAccum.set(index, {
        id: `call_${index}`,
        type: "function",
        function: {
          name: tc.function.name,
          arguments: safeJsonStringifyOr(tc.function.arguments,),
        },
      },);
    }
  }

  if (chunk.done) {
    acc.finishReason = mapFinishReason(chunk.done_reason,);
    if (chunk.eval_count !== undefined || chunk.prompt_eval_count !== undefined) {
      acc.usage = {
        promptTokens: chunk.prompt_eval_count ?? 0,
        completionTokens: chunk.eval_count ?? 0,
        totalTokens: (chunk.prompt_eval_count ?? 0) + (chunk.eval_count ?? 0),
      };
    }
    handler({ type: "done", finishReason: acc.finishReason, usage: acc.usage, },);
    return true;
  }

  return false;
}

function safeJsonStringifyOr(value: unknown,): string {
  if (typeof value === "string") { return value; }
  const result = safeJsonStringify(value,);
  return result.ok ? result.value : "";
}
