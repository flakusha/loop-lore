// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { ChatMessage, } from "./types";

/**
 * Format a message line for display in the blessed list (truncated to 200 cols).
 * Cuts on a column boundary so a surrogate pair or wide CJK/full-width glyph
 * is never split — a `.slice(0, 200)` by UTF-16 code unit would do exactly that.
 * @param message - chat message
 * @returns blessed markup string `<bold>{actor|role}</bold>: <content…>`.
 */
export function formatMessageLine(message: ChatMessage,): string {
  const prefix = message.actorName
    ? `{bold}${message.actorName}{/bold}: `
    : `{bold}${message.role}{/bold}: `;

  // ponytail: O(n) scan of message content — content is LLM output, not a
  // hot path. Profile first before swapping for a reverse-index approach.
  const MAX_WIDTH = 200;
  let truncated = "";
  for (const ch of message.content) {
    if (Bun.stringWidth(truncated + ch,) > MAX_WIDTH) { break; }
    truncated += ch;
  }

  const needs_ellipsis = Bun.stringWidth(message.content,) > MAX_WIDTH;

  return `${prefix}${truncated}${needs_ellipsis ? "..." : ""}`;
}
