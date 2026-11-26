// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { escapeMarkup, } from "../markup";
import type { ChatMessage, } from "./types";

/**
 * Compact attachment chip: `[count:firstAssetId…]`. The asset id comes from
 * the API payload, so it is escaped before reaching the `tags: true` row.
 */
function attachmentChip(
  attachments: NonNullable<ChatMessage["attachments"]>,
): { text: string; width: number } {
  const count = attachments.length;
  const first = attachments[0]?.assetId ?? "";
  const id = Array.from(first,).slice(0, 8,).join("",);
  const raw = count + (id ? ":" + id : "");
  return {
    text: " {bold}[" + escapeMarkup(raw,) + "]{/bold}",
    // Blessed swallows the tags; only the visible text occupies columns.
    width: Bun.stringWidth(" [" + raw + "]",),
  };
}

/**
 * Format a message line for display in the blessed list (truncated to 200 cols).
 * Cuts on a column boundary so a surrogate pair or wide CJK/full-width glyph
 * is never split — a `.slice(0, 200)` by UTF-16 code unit would do exactly that.
 * @param message - chat message
 * @returns blessed markup string with an optional attachment chip.
 */
export function formatMessageLine(message: ChatMessage,): string {
  const prefix = message.actorName
    ? `{bold}${escapeMarkup(message.actorName,)}{/bold}: `
    : `{bold}${escapeMarkup(message.role,)}{/bold}: `;

  const chip = message.attachments?.length
    ? attachmentChip(message.attachments,)
    : undefined;

  // The chip shares the content budget so a long transcript line never
  // grows past the width a message without attachments already occupies.
  const budget = 200 - (chip?.width ?? 0);

  // ponytail: O(n) scan of message content — content is LLM output, not a
  // hot path. Profile first before swapping for a reverse-index approach.
  let truncated = "";
  for (const ch of message.content) {
    if (Bun.stringWidth(truncated + ch,) > budget) { break; }
    truncated += ch;
  }

  const needs_ellipsis = Bun.stringWidth(message.content,) > budget;

  const suffix = needs_ellipsis ? "..." : "";
  return prefix + escapeMarkup(truncated,) + suffix + (chip?.text ?? "");
}
