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
  ToolCall,
} from "../types";
import { buildBody, fetchWithRetry, mapFinishReason, } from "./http";
import type {
  AnthropicMessagesResponse,
  AnthropicState,
  AnthropicToolUseBlock,
} from "./types";
export { streamDispatch, } from "./stream";

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
