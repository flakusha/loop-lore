/**
 * Tool execution — gate plugin tools by agent role and run provider tool calls
 * through the plugin registry.
 *
 * Extracted from generate-route.ts (pure refactor, no behavior change).
 */

import { registry, } from "../../plugins/registry";
import type { ToolDefinition, } from "../../plugins/types";
import { jsonParseOr, jsonStringifyOr, } from "../../utils";
import type { GenerationMessage, } from "../types";

/** Maximum rounds of tool calls in the generation loop. */
export const MAX_TOOL_ROUNDS = 5;

/**
 * Gate plugin tools by the actor's assigned agent role.
 *
 * When `agentRole` is set and a matching plugin role is registered, only the
 * tools the role declares are exposed to the model. When no role is assigned
 * (or the role declares no tools), all registered plugin tools are exposed.
 *
 * @param agentRole - The actor's assigned plugin agent role id (or null)
 * @returns The filtered list of plugin tool definitions
 */
export function gatePluginToolsByRole(agentRole: string | null,): ToolDefinition[] {
  const pluginTools = registry.getAllTools();
  if (!agentRole) { return pluginTools; }

  const role = registry.getAgentRole(agentRole,);
  if (!role?.tools?.length) { return pluginTools; }

  const allowed = new Set(role.tools,);
  const out: ToolDefinition[] = [];
  for (const t of pluginTools) { if (allowed.has(t.name,)) { out.push(t,); } }
  return out;
}

interface ToolCallItem {
  id: string;
  function: { name: string; arguments: string };
}

/**
 * Execute tool calls and return tool result messages.
 * Looks up ToolDefinition from the plugin registry by name.
 */
export async function executeToolCalls(toolCalls: ToolCallItem[],): Promise<GenerationMessage[]> {
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

    const params: Record<string, unknown> = jsonParseOr(tc.function.arguments, {},);

    try {
      const toolResult = await def.handler(params,);
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
