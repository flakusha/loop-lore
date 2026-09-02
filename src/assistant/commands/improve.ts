// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/assistant/commands/improve.ts
//
// /improve — rewrite user text for better quality.
//
// Flow: LLM-first (when a `complete` injection is supplied), local-heuristics
// fallback otherwise. The LLM is given a clarity/flow system prompt; the
// fallback applies basic capitalization + punctuation cleanup.

import { type CommandResult, type CommandHandler, registerCommand, } from "./registry";

/** Deps shape for /improve. */
export interface ImproveDeps {
  complete?: (req: { prompt: string; systemPrompt: string }) => Promise<{ content: string }>;
}

/**
 * Core `/improve` logic. Extractable so tests can inject a stub `complete`.
 * @param args
 * @param _ctx
 * @param deps
 */
export async function runImprove(
  args: string[],
  _ctx: Parameters<CommandHandler>[1],
  deps: ImproveDeps,
): Promise<CommandResult> {
  const text = args.join(" ",).trim();

  if (!text) {
    return {
      systemMessage:
        "Usage: /improve <text> — rewrite text for better quality.\nYou can also reply to a message with /improve to improve it.",
      handled: true,
    };
  }

  const systemPrompt = "Rewrite the following text for clarity and flow. Preserve meaning.";

  if (deps.complete) {
    try {
      const result = await deps.complete({ prompt: text, systemPrompt, });
      const content = result.content.trim();
      if (content) {
        return {
          systemMessage: `**Improved:**\n\n${content}`,
          actionPayload: { original: text, improved: content, },
          handled: true,
        };
      }
    } catch {
      // Fall through to local heuristics on LLM failure
    }
  }

  const improved = improveText(text,);
  return {
    systemMessage: `**Improved:**\n\n${improved}\n\n[LLM unavailable — applied local heuristics only]`,
    actionPayload: { original: text, improved, fallback: true, },
    handled: true,
  };
}

registerCommand("improve", (args, ctx,): CommandResult | Promise<CommandResult> => {
  return runImprove(args, ctx, {},);
},);

/**
 * Local fallback: capitalization, punctuation, whitespace cleanup.
 * @param text
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
