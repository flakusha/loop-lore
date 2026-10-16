// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Plugin ToolExecutor (FEAT-049).
 *
 * Invokes `tool.handler` with a timeout race. Handler errors and timeouts
 * surface as `isError` results using the same `{ error }` content shape as
 * the generation tool loop (`src/generation/generate-route/tool-execution.ts`),
 * so callers observe one failure contract.
 *
 * A declared `tool.policy` is checked here, on every invocation, and never
 * cached: a tool loaded before its tag was known is still gated, and one that
 * gains a tag after a first invocation cannot keep that decision.
 */

import type {
  ToolDefinition,
  ToolExecutionContext,
  ToolResult,
} from "./types";
import { assertToolPolicySatisfied } from "./tool-policy";
import { jsonStringifyOr, } from "../utils";

/** Default handler timeout when `tool.timeoutMs` is unset. */
export const DEFAULT_TOOL_TIMEOUT_MS = 30_000;

/**
 * Execute a plugin tool.
 * @param tool - Tool definition to execute.
 * @param params - Parameters for the handler.
 * @param ctx - Optional per-request execution context.
 * @returns The handler result, or an `isError` result on throw/timeout.
 */
export async function executePluginTool(
  tool: ToolDefinition,
  params: Record<string, unknown>,
  ctx?: ToolExecutionContext,
): Promise<ToolResult> {
  const timeoutMs = tool.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS;
  try {
    assertToolPolicySatisfied(tool,);
    const handler = Promise.resolve(tool.handler(params, ctx));
    return await new Promise<ToolResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Tool "${tool.name}" timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      handler.then(
        (result) => { clearTimeout(timer); resolve(result); },
        (error: unknown) => { clearTimeout(timer); reject(error); },
      );
    });
  } catch (error) {
    return {
      content: jsonStringifyOr({ error: error instanceof Error ? error.message : String(error), }),
      isError: true,
    };
  }
}
