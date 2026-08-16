// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Core generation dispatchers (Anthropic) ─────────────
//
// Threaded with an explicit `state` handle, mirroring the openai-compatible
// provider's dispatcher structure.

import { safeJsonStringify, } from "../../../utils";
import type {
  GenerateRequest,
  GenerateResponse,
  StreamHandler,
  ToolCall,
} from "../types";
import { ProviderError, } from "../types";
import { buildBody, fetchRaw, fetchWithRetry, handleErrorResponse, mapFinishReason, } from "./http";
import { parseAnthropicEvent, } from "./sse";
import type {
  AnthropicMessagesResponse,
  AnthropicState,
  AnthropicStreamEvent,
  AnthropicToolUseBlock,
} from "./types";

/** Serialize a tool-use input object to the string form expected by ToolCall. */
function stringifyToolInput(input: Record<string, unknown> | undefined,): string {
  const result = safeJsonStringify(input ?? {},);
  return result.ok ? result.value : "";
}

export async function completeDispatch(
  state: AnthropicState,
  req: GenerateRequest,
): Promise<GenerateResponse> {
  const body = buildBody(state, req, false,);
  const toolCalling = Boolean(req.tools && req.tools.length > 0,);
  const url = `${state.baseUrl}/v1/messages`;
  const data = (await fetchWithRetry(
    state,
    url,
    body,
    req.signal,
    req.apiKey,
    toolCalling,
  )) as AnthropicMessagesResponse;

  const blocks = data.content ?? [];
  const textParts: string[] = [];
  const toolUses: AnthropicToolUseBlock[] = [];

  for (const block of blocks) {
    if (block.type === "text") { textParts.push(block.text,); }
    if (block.type === "tool_use") { toolUses.push(block,); }
  }

  const toolCalls: ToolCall[] | undefined = toolUses.length > 0
    ? Array.from(toolUses, (tc,) => ({
      id: tc.id,
      type: "function",
      function: {
        name: tc.name,
        arguments: stringifyToolInput(tc.input,),
      },
    }),)
    : undefined;

  return {
    content: textParts.join("",),
    toolCalls,
    finishReason: mapFinishReason(data.stop_reason,),
    usage: {
      promptTokens: data.usage?.input_tokens ?? 0,
      completionTokens: data.usage?.output_tokens ?? 0,
      totalTokens: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0),
    },
  };
}

interface StreamAccum {
  fullContent: string;
  fullThinking: string;
  toolArgsAccum: Map<number, { id: string; name: string; args: string }>;
  finishReason: GenerateResponse["finishReason"];
  inputTokens: number;
  outputTokens: number;
}

export async function streamDispatch(
  state: AnthropicState,
  req: GenerateRequest,
  handler: StreamHandler,
): Promise<GenerateResponse> {
  const body = buildBody(state, req, true,);
  const signal = req.signal;
  const toolCalling = Boolean(req.tools && req.tools.length > 0,);

  const url = new URL(`${state.baseUrl}/v1/messages`,);
  const response = await fetchRaw(state, url.href, body, signal, req.apiKey, toolCalling,);
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
    toolArgsAccum: new Map(),
    finishReason: "stop",
    inputTokens: 0,
    outputTokens: 0,
  };
  const pending: PendingEvent = { name: "", };

  try {
    while (true) {
      const { done, value, } = await (reader.read() as Promise<{ done: boolean; value?: Uint8Array }>);
      if (done) { break; }

      buffer += decoder.decode(value, { stream: true, },);
      const lines = buffer.split("\n",);
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (applyStreamLine(line, signal, handler, acc, pending,)) { break; }
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

  const toolCalls: ToolCall[] = [];
  for (const [, tc,] of acc.toolArgsAccum) {
    toolCalls.push({
      id: tc.id,
      type: "function",
      function: { name: tc.name, arguments: tc.args, },
    },);
  }

  if (toolCalls.length > 0) {
    for (const tc of toolCalls) {
      handler({ type: "tool_call", toolCall: tc, },);
    }
  }

  return {
    content: acc.fullContent,
    thinking: acc.fullThinking || undefined,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    finishReason: acc.finishReason,
    usage: {
      promptTokens: acc.inputTokens,
      completionTokens: acc.outputTokens,
      totalTokens: acc.inputTokens + acc.outputTokens,
    },
  };
}

/** Holds the pending SSE event name carried between `event:` and `data:` lines. */
interface PendingEvent {
  name: string;
}

/**
 * Process a single SSE line from the Anthropic stream.
 *
 * @param line - One SSE line (`event:` or `data:`)
 * @param signal - Abort signal; when aborted the stream is marked cancelled
 * @param handler - Stream event callback
 * @param acc - Mutable accumulators
 * @param pending - Mutable carrier for the pending event name
 * @returns `true` when the caller should stop reading further lines
 */
function applyStreamLine(
  line: string,
  signal: AbortSignal | undefined,
  handler: StreamHandler,
  acc: StreamAccum,
  pending: PendingEvent,
): boolean {
  if (signal?.aborted) {
    acc.finishReason = "cancelled";
    return true;
  }

  const trimmed = line.trim();
  if (trimmed === "") { return false; }

  if (trimmed.startsWith("event:",)) {
    pending.name = trimmed.slice("event:".length,).trim();
    return false;
  }
  if (!trimmed.startsWith("data:",)) { return false; }

  const frame = parseAnthropicEvent(`event: ${pending.name}`, line,);
  if (!frame) { return false; }
  applyEvent(frame.data, handler, acc,);
  return false;
}

/**
 * Apply a single Anthropic stream event to the accumulator + handler.
 *
 * @param event - Parsed event
 * @param handler - Stream event callback
 * @param acc - Mutable accumulators (content, thinking, tool calls, usage)
 */
function applyEvent(event: AnthropicStreamEvent, handler: StreamHandler, acc: StreamAccum,): void {
  switch (event.type) {
    case "message_start": {
      if (event.message?.usage?.input_tokens !== undefined) {
        acc.inputTokens += event.message.usage.input_tokens;
      }
      break;
    }

    case "content_block_start": {
      if (event.content_block?.type === "tool_use" && event.content_block.id) {
        acc.toolArgsAccum.set(event.index, {
          id: event.content_block.id,
          name: event.content_block.name ?? "",
          args: "",
        },);
      }
      break;
    }

    case "content_block_delta": {
      if (event.delta?.type === "text_delta" && event.delta.text) {
        acc.fullContent += event.delta.text;
        handler({ type: "content", content: event.delta.text, },);
      }
      if (event.delta?.type === "thinking_delta" && event.delta.thinking) {
        acc.fullThinking += event.delta.thinking;
        handler({ type: "thinking", content: event.delta.thinking, },);
      }
      if (event.delta?.type === "input_json_delta" && event.delta.partial_json) {
        const entry = acc.toolArgsAccum.get(event.index,);
        if (entry) { entry.args += event.delta.partial_json; }
      }
      break;
    }

    case "message_delta": {
      if (event.delta?.stop_reason) {
        acc.finishReason = mapFinishReason(event.delta.stop_reason,);
        handler({ type: "done", finishReason: acc.finishReason, },);
      }
      if (event.usage?.output_tokens !== undefined) {
        acc.outputTokens = event.usage.output_tokens;
      }
      break;
    }

    case "content_block_stop":
    case "message_stop": {
      break;
    }

    default: {
      break;
    }
  }
}
