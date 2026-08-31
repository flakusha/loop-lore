// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Request-body construction for the Anthropic provider ────────────
//
// Builds the `POST /v1/messages` JSON body from the shared generate request,
// mapping roles and tool results onto Anthropic's message content blocks.

import type { GenerationMessage, } from "../../gen-types-options";
import type { GenerateRequest, ToolDef, } from "../types";
import type { AnthropicState, AnthropicToolResultBlock, } from "./types";

/**
 * @param role
 */
function mapRole(role: GenerationMessage["role"],): "user" | "assistant" {
  // Anthropic Messages only accepts `user`/`assistant`. Map `character`
  // (speaker persona) and `tool` (tool-result turns, handled via blocks).
  if (role === "character") { return "assistant"; }
  return role === "assistant" ? "assistant" : "user";
}

/**
 * @param tool
 */
export function mapToolDef(tool: ToolDef,): Record<string, unknown> {
  return {
    name: tool.function.name,
    description: tool.function.description,
    input_schema: tool.function.parameters,
  };
}

/**
 * Build the Anthropic request body, extracting system messages into the
 * top-level `system` field (Anthropic does not accept a `system` role in
 * the messages array).
 * @param messages
 */
export function buildMessages(
  messages: GenerationMessage[],
): { system: string; messages: ({ role: "user" | "assistant"; content: unknown })[] } {
  const systemParts: string[] = [];
  const out: { role: "user" | "assistant"; content: unknown }[] = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      if (msg.content) { systemParts.push(msg.content,); }
      continue;
    }

    if (msg.role === "tool") {
      // Tool result → a user turn carrying a tool_result content block.
      const block: AnthropicToolResultBlock = {
        type: "tool_result",
        tool_use_id: msg.tool_call_id ?? "",
        content: msg.content ?? "",
      };
      const last = out[out.length - 1];
      if (last?.role === "user" && Array.isArray(last.content,)) {
        last.content = [...(last.content as unknown[]), block,];
      } else {
        out.push({ role: "user", content: [block,], },);
      }
      continue;
    }

    const role = mapRole(msg.role,);
    out.push({ role, content: msg.content ?? "", },);
  }

  return { system: systemParts.join("\n\n",), messages: out, };
}

/**
 * @param req
 * @param body
 */
function buildToolCallsParam(req: GenerateRequest, body: Record<string, unknown>,): void {
  if (req.tools && req.tools.length > 0) {
    body.tools = Array.from(req.tools, mapToolDef,);
  }
}

/**
 * @param state
 * @param req
 * @param stream
 */
export function buildBody(
  state: AnthropicState,
  req: GenerateRequest,
  stream: boolean,
): Record<string, unknown> {
  const { system, messages, } = buildMessages(req.messages,);
  const params = req.params;

  const body: Record<string, unknown> = {
    model: req.model || state.defaultModel,
    max_tokens: params.maxTokens ?? 4096,
    messages,
    stream,
  };

  if (system) { body.system = system; }
  if (params.temperature !== undefined) { body.temperature = params.temperature; }
  if (params.topP !== undefined) { body.top_p = params.topP; }
  if (params.stop && params.stop.length > 0) { body.stop_sequences = params.stop; }

  buildToolCallsParam(req, body,);

  // Provider-specific overrides
  for (const [key, value,] of Object.entries(params,)) {
    if (!Object.hasOwn(body, key,) && !(key in STANDARD_KEYS)) {
      body[key] = value;
    }
  }

  return body;
}

/** Keys already mapped to Anthropic body fields — excluded from raw passthrough. */
const STANDARD_KEYS: Record<string, true> = {
  temperature: true,
  maxTokens: true,
  topP: true,
  stream: true,
  stop: true,
  presencePenalty: true,
  frequencyPenalty: true,
  minP: true,
  topK: true,
  typicalP: true,
  repeatPenalty: true,
  dryMultiplier: true,
  dryBase: true,
  dryAllowedLength: true,
  xtcProbability: true,
  dynatempRange: true,
  dynatempExponent: true,
  reasoningBudget: true,
};
