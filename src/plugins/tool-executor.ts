// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Plugin ToolExecutor placeholder (FEAT-049).
 *
 * No-op integration: correct `(tool, params, ctx)` → `ToolResult` I/O, but
 * never invokes the tool handler. Full wiring adds timeout, sandbox, and
 * permission checks before calling `tool.handler`.
 */

import type {
  ToolDefinition,
  ToolExecutionContext,
  ToolResult,
} from "./types";

/**
 * Resolve a tool call without executing it.
 *
 * Placeholder: always returns an error result so callers observe the real
 * failure shape. Never calls `tool.handler`.
 * @param tool - Tool definition to execute.
 * @param params - Parameters for the handler.
 * @param ctx - Optional per-request execution context.
 * @returns Error `ToolResult` marking the executor as unwired.
 * @example
 * const res = await executePluginTool(tool, { q: "hi" });
 * // res.isError === true
 */
export async function executePluginTool(
  tool: ToolDefinition,
  params: Record<string, unknown>,
  ctx?: ToolExecutionContext,
): Promise<ToolResult> {
  void params;
  void ctx;
  return {
    content: `Tool "${tool.name}" has no executor yet (FEAT-049 placeholder).`,
    metadata: { placeholder: true, tool: tool.name, },
    isError: true,
  };
}
