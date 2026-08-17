// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Streaming message/builders for the generation streaming path. Extracted
 * from stream-to-client.ts (pure refactor, no behavior change) to keep that
 * module under the 250L size ceiling.
 */

import type { GenerationMessage, GenerationToolCall, } from "../types";

/**
 * Map provider tool calls to the canonical GenerationToolCall shape
 * (id + type + function name/arguments) used for both persistence and the
 * assistant tool-call message fed back into the conversation.
 */
export function toGenerationToolCalls(
  toolCalls: { id: string; function: { name: string; arguments: string } }[],
): GenerationToolCall[] {
  return Array.from(toolCalls, (tc,) => ({
    id: tc.id,
    type: "function" as const,
    function: { name: tc.function.name, arguments: tc.function.arguments, },
  }),);
}

/**
 * Build the assistant message carrying tool calls to append to the
 * conversation before the next tool-execution round.
 */
export function buildToolCallAssistantMessage(
  content: string,
  toolCalls: { id: string; function: { name: string; arguments: string } }[],
): GenerationMessage {
  return {
    role: "assistant" as const,
    content: content || "",
    tool_calls: toGenerationToolCalls(toolCalls,),
  };
}
