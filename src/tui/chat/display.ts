// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { ChatMessage, } from "./types";

/**
 * Format a message line for display in the blessed list.
 * @param message
 */
export function formatMessageLine(message: ChatMessage,): string {
  const prefix = message.actorName
    ? `{bold}${message.actorName}{/bold}: `
    : `{bold}${message.role}{/bold}: `;

  return `${prefix}${message.content.slice(0, 200,)}${message.content.length > 200 ? "..." : ""}`;
}
