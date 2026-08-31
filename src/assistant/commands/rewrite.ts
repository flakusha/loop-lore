// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * /rewrite command — rewrite the last assistant message or given text.
 *
 * Registers the "rewrite" command alias. Returns a rewritten version of the
 * target text using basic local heuristics. In future iterations this will
 * route through the LLM generation pipeline.
 * @module assistant/commands/rewrite
 */

import { type CommandResult, registerCommand, } from "./registry";

/**
 * Rewrite the last assistant message or provided text.
 *
 * Usage:
 *   /rewrite                     → rewrite the last assistant message
 *   /rewrite <text>              → rewrite the given text
 *   /rewrite <text> --style <s>  → rewrite with a specific style
 */
registerCommand("rewrite", (args, ctx,): CommandResult => {
  // Determine target text: explicit argument vs. last assistant message
  let targetText: string | undefined;
  let style = "clear";

  const styleArgIndex = args.indexOf("--style",);
  if (styleArgIndex !== -1 && styleArgIndex + 1 < args.length) {
    style = args[styleArgIndex + 1] ?? "clear";
    args.splice(styleArgIndex, 2,);
  }

  if (args.length > 0) {
    targetText = args.join(" ",);
  } else if (ctx.messages && ctx.messages.length > 0) {
    // Find last assistant/character message
    for (let i = ctx.messages.length - 1; i >= 0; i--) {
      const m = ctx.messages[i];
      if (m !== undefined && (m.role === "assistant" || m.role === "character")) {
        targetText = m.content;
        break;
      }
    }
  }

  if (!targetText) {
    return {
      systemMessage: "**No text to rewrite.** Provide text or ensure an assistant message exists.",
      handled: true,
    };
  }

  const rewritten = rewriteText(targetText, style,);

  return {
    systemMessage: `**Rewritten (${style}):**\n\n${rewritten}`,
    actionPayload: { original: targetText, rewritten, style, },
    handled: true,
  };
},);

/**
 * Apply basic text rewriting heuristics.
 *
 * Current transformations (to be replaced by LLM-based rewriting):
 * - Trim excess whitespace
 * - Fix common punctuation patterns
 * - Apply style-appropriate sentence structure hints
 * @param text - The text to rewrite
 * @param style - Rewriting style ("clear", "concise", "dramatic", "formal")
 * @returns Rewritten text
 */
function rewriteText(text: string, style: string,): string {
  let result = text.trim();

  // Remove excess whitespace
  result = result.replaceAll(/ {2,}/g, " ",);

  // Style-based transformations
  switch (style) {
    case "concise": {
      // Remove filler words
      result = result.replaceAll(/\b(just|very|really|quite|actually|basically|literally)\b/gi, "",);
      result = result.replaceAll(/\s{2,}/g, " ",);
      break;
    }
    case "dramatic": {
      // Emphasize with stronger punctuation
      result = result.replaceAll(/\.{2,}/g, "...",);
      // Capitalize key emotional words
      result = result.replaceAll(/\b(suddenly|never|always|forever|absolute)\b/gi, (w,) => w.toUpperCase(),);
      break;
    }
    case "formal": {
      // Expand contractions
      result = result
        .replaceAll(/\bdon't\b/gi, "do not",)
        .replaceAll(/\bcan't\b/gi, "cannot",)
        .replaceAll(/\bwon't\b/gi, "will not",)
        .replaceAll(/\bit's\b/gi, "it is",)
        .replaceAll(/\bi'm\b/gi, "I am",)
        .replaceAll(/\byou're\b/gi, "you are",)
        .replaceAll(/\bthey're\b/gi, "they are",);
      break;
    }
    default: {
      // "clear" — minimal changes, just cleanup
      break;
    }
  }

  // Ensure ends with sentence-ending punctuation
  if (result.length > 0 && !/[.!?…"]$/.test(result,)) {
    result += ".";
  }

  return result;
}

export { rewriteText, };
