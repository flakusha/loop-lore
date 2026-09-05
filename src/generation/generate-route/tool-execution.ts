// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tool execution — gate plugin tools by agent role and run provider tool calls
 * through the plugin registry.
 *
 * Extracted from generate-route.ts (pure refactor, no behavior change).
 *
 * BUG-generation-error-handling-gaps-detector-abort-void-promises:
 * Tool outputs are sanitized before being re-injected into the assistant
 * prompt so an attacker-controlled tool result cannot smuggle
 * `<script>`/on-event HTML into the next LLM turn.
 */

import { registry, } from "../../plugins/registry";
import type { ToolDefinition, ToolExecutionContext, } from "../../plugins/types";
import { DANGEROUS_TAGS, JS_URL_ATTR, ON_EVENT_DOUBLE, ON_EVENT_SINGLE, ON_EVENT_UNQUOTED, SCRIPT_TAG, } from "../../regex/html-sanitize";
import { jsonStringifyOr, safeJsonParse, } from "../../utils";
import type { GenerationMessage, } from "../types";

/** Maximum rounds of tool calls in the generation loop. */
export const MAX_TOOL_ROUNDS = 5;

/**
 * Strip dangerous HTML from tool output before re-injection into the
 * assistant prompt. `<script>` tags and inline `on*` event handlers are
 * scrubbed; the rest of the content passes through unchanged so legitimate
 * tool output (e.g. JSON, markdown) is not lost.
 * @param content - Raw tool output string.
 * @returns Sanitized content safe for prompt re-use.
 */
export function sanitizeToolOutput(content: string,): string {
  if (!content) { return content; }
  return content
    .replace(SCRIPT_TAG, "",)
    .replace(ON_EVENT_DOUBLE, "",)
    .replace(ON_EVENT_SINGLE, "",)
    .replace(ON_EVENT_UNQUOTED, "",)
    .replace(JS_URL_ATTR, "",)
    .replace(DANGEROUS_TAGS, "",);
}

/**
 * Gate plugin tools by the actor's assigned agent role.
 * @param agentRole - The actor's assigned plugin agent role id (or null)
 * @returns The filtered list of plugin tool definitions
 */
export function gatePluginToolsByRole(agentRole: string | null,): ToolDefinition[] {
  const pluginTools = registry.getAllTools();
  if (!agentRole) { return pluginTools; }

  const role = registry.getAgentRole(agentRole,);
  if (!role) { return pluginTools; }
  if (!role.tools?.length) { return []; }

  const allowed: Record<string, true> = {};
  for (const name of role.tools) { allowed[name] = true; }
  const out: ToolDefinition[] = [];
  for (const t of pluginTools) { if (allowed[t.name]) { out.push(t,); } }
  return out;
}

interface ToolCallItem {
  id: string;
  function: { name: string; arguments: string };
}

/**
 * Execute tool calls and return tool result messages.
 * @param toolCalls - Tool call items from the provider response
 * @param ctx - Optional per-request execution context (db + actor + chat),
 *   forwarded to tool handlers; builtin tools (e.g. write_memory_note) require it.
 * @returns Tool-result messages to append to the conversation
 */
export async function executeToolCalls(
  toolCalls: ToolCallItem[],
  ctx?: ToolExecutionContext,
): Promise<GenerationMessage[]> {
  const toolDefs = registry.getAllTools();
  const results: GenerationMessage[] = [];

  for (const tc of toolCalls) {
    const def = toolDefs.find((d,) => d.name === tc.function.name);
    if (!def) {
      results.push({
        role: "tool",
        content: sanitizeToolOutput(jsonStringifyOr({ error: `Tool not found: ${tc.function.name}`, },),),
        tool_call_id: tc.id,
      },);
      continue;
    }
    const parsed = safeJsonParse<Record<string, unknown>>(tc.function.arguments,);
    const valueIsObject = parsed.ok &&
      parsed.value !== null &&
      typeof parsed.value === "object" &&
      !Array.isArray(parsed.value,);
    if (!valueIsObject) {
      const detail = parsed.ok
        ? `got ${parsed.value === null ? "null" : Array.isArray(parsed.value,) ? "array" : typeof parsed.value}`
        : parsed.error.message;
      results.push({
        role: "tool",
        content: sanitizeToolOutput(jsonStringifyOr({
          error: `tool arguments must be a JSON object: ${detail}`,
          received: tc.function.arguments.slice(0, 200,),
        },),),
        tool_call_id: tc.id,
      },);
      continue;
    }
    const params = parsed.value;
    try {
      const toolResult = await def.handler(params, ctx,);
      results.push({
        role: "tool",
        content: sanitizeToolOutput(toolResult.content,),
        tool_call_id: tc.id,
      },);
    } catch (error) {
      results.push({
        role: "tool",
        content: sanitizeToolOutput(jsonStringifyOr({ error: (error as Error).message, },),),
        tool_call_id: tc.id,
      },);
    }
  }

  return results;
}
