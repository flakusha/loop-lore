// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * SSE serialization + live-stream rendering helpers for the generation
 * streaming path. Extracted from stream-to-client.ts (pure refactor, no
 * behavior change) to keep that module under the 250L size ceiling.
 */

import { safeJsonStringify, } from "../../utils";

/**
 * @param obj
 */
export function sseData(obj: unknown,): string {
  const r = safeJsonStringify(obj,);
  return `data: ${r.ok ? r.value : '{"type":"error","error":"serialize failed"}'}\n\n`;
}

/**
 * Escape HTML special characters for safe injection into rendered output.
 * @param str
 */
export function escapeHtml(str: string,): string {
  return str
    .replaceAll("&", "&amp;",)
    .replaceAll("<", "&lt;",)
    .replaceAll(">", "&gt;",)
    .replaceAll('"', "&quot;",)
    .replaceAll("'", "&#39;",);
}

/**
 * Render a collapsible tool-call block for the live stream consumer.
 * @param toolName
 * @param toolArguments
 */
export function renderToolCallBlock(toolName: string, toolArguments: string,): string {
  const name = escapeHtml(toolName,);
  const args = escapeHtml(toolArguments,);
  return (
    `<details class="tool-call-block" data-testid="tool-call-block">` +
    `<summary>🛠 Call tool: <code>${name}</code></summary>` +
    `<pre class="tool-call-args">${args}</pre>` +
    `</details>`
  );
}
