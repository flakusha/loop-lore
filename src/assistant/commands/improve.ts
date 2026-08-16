// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/assistant/commands/improve.ts
//
// /improve — rewrite user text for better quality.

import { type CommandResult, registerCommand, } from "./registry";

registerCommand("improve", (args,): CommandResult => {
  const text = args.join(" ",).trim();

  if (!text) {
    return {
      systemMessage:
        "Usage: /improve <text> — rewrite text for better quality.\nYou can also reply to a message with /improve to improve it.",
      handled: true,
    };
  }

  const improved = improveText(text,);

  return {
    systemMessage: `**Improved:**\n\n${improved}`,
    handled: true,
  };
},);

/**
 * Basic text improvement without LLM.
 * Fixes common issues: capitalization, punctuation, spacing.
 *
 * NOTE: This is a placeholder. The real implementation should call
 * the generation pipeline with a "rewrite" prompt. For now, we do
 * basic text cleanup.
 */
function improveText(text: string,): string {
  let result = text.trim();

  // Capitalize first letter
  if (result.length > 0) {
    result = result.charAt(0,).toUpperCase() + result.slice(1,);
  }

  // Ensure ends with punctuation
  if (result.length > 0 && !/[.!?]$/.test(result,)) {
    result += ".";
  }

  // Fix double spaces
  result = result.replaceAll(/ {2,}/g, " ",);

  // Fix space before punctuation
  result = result.replaceAll(/ ([.,!?;:])/g, "$1",);

  return result;
}
