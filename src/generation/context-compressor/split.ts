// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { ContextMessage, } from "../context-window-config";
import type { SplitMessages, } from "./types";

/**
 * Separate leading system messages from conversation messages
 * @param messages
 */
export function splitSystemMessages(messages: ContextMessage[],): SplitMessages {
  const system: ContextMessage[] = [];
  const conversation: ContextMessage[] = [];

  let inSystemBlock = true;
  for (const msg of messages) {
    if (inSystemBlock && msg.role === "system") {
      system.push(msg,);
    } else {
      inSystemBlock = false;
      conversation.push(msg,);
    }
  }

  return { system, conversation, };
}
