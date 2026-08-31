// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tool execution — gate plugin tools by agent role and run provider tool calls
 * through the plugin registry.
 *
 * Extracted from generate-route.ts (pure refactor, no behavior change).
 */

import { registry, } from "../../plugins/registry";
import type { ToolDefinition, ToolExecutionContext, } from "../../plugins/types";
import { jsonStringifyOr, safeJsonParse, } from "../../utils";
import type { GenerationMessage, } from "../types";

/** Maximum rounds of tool calls in the generation loop. */
export const MAX_TOOL_ROUNDS = 5;

/**
 * Gate plugin tools by the actor's assigned agent role.
 *
 * Policy:
 * - `agentRole === null` (no role assigned) → all plugin tools are exposed.
 *   This matches the prior "unassigned = unrestricted" baseline so existing
 *   single-user / demo deployments don't suddenly lose tools.
 * - Role registered but `tools: []` → zero plugin tools (explicit deny).
 *   SECURITY (BUG-plugin-tool-gating-empty-role-bypass): an empty allowlist
 *   MUST NOT fall through to "all tools" — that's a privilege escalation vs
 *   the unassigned baseline, because role assignment implies intent.
 * - Role registered with named tools → only those.
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
 * Looks up ToolDefinition from the plugin registry by name.
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
        content: jsonStringifyOr({ error: `Tool not found: ${tc.function.name}`, },),
        tool_call_id: tc.id,
      },);
      continue;
    }
    // Parse tool arguments strictly. BUG-tool-call-arg-parse-silent-fallback:
    // silent `{}` fallback meant the model couldn't self-correct when it
    // emitted malformed JSON — handler threw a generic runtime error
    // instead of a syntax diagnostic.
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
        content: jsonStringifyOr({
          error: `tool arguments must be a JSON object: ${detail}`,
          received: tc.function.arguments.slice(0, 200,),
        },),
        tool_call_id: tc.id,
      },);
      continue;
    }
    const params = parsed.value;
    try {
      const toolResult = await def.handler(params, ctx,);
      results.push({
        role: "tool",
        content: toolResult.content,
        tool_call_id: tc.id,
      },);
    } catch (error) {
      results.push({
        role: "tool",
        content: jsonStringifyOr({ error: (error as Error).message, },),
        tool_call_id: tc.id,
      },);
    }
  }

  return results;
}
