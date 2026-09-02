// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * /rewrite command — rewrite the last assistant message or given text.
 *
 * Registers the "rewrite" command. Routes to the LLM when a `complete` injection
 * is supplied with a style-specific system prompt; otherwise falls back to
 * local heuristics (filler removal, contraction expansion, capitalization).
 * @module assistant/commands/rewrite
 */

import { type CommandResult, type CommandHandler, registerCommand, } from "./registry";

/** Deps shape for rewriting. */
export interface RewriteDeps {
  complete?: (req: { prompt: string; systemPrompt: string }) => Promise<{ content: string }>;
}

/**
 * Extract `--style <name>` from args, returning the chosen style and the
 * remaining positional args. Defaults to "clear".
 * @param args
 */
function parseStyle(args: string[],): { style: string; rest: string[] } {
  const idx = args.indexOf("--style",);
  if (idx !== -1 && idx + 1 < args.length) {
    return { style: args[idx + 1] ?? "clear", rest: args.filter((_, i,) => i !== idx && i !== idx + 1,), };
  }
  return { style: "clear", rest: args, };
}

/**
 * Core `/rewrite` logic. Extractable so tests can inject a stub `complete`.
 * @param args
 * @param ctx
 * @param deps
 */
export async function runRewrite(
  args: string[],
  ctx: Parameters<CommandHandler>[1],
  deps: RewriteDeps,
): Promise<CommandResult> {
  const { style, rest, } = parseStyle(args,);

  let targetText: string | undefined;

  if (rest.length > 0) {
    targetText = rest.join(" ",);
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

  const systemPrompt = `Rewrite the following text in ${style} style. Preserve meaning.`;

  if (deps.complete) {
    try {
      const result = await deps.complete({ prompt: targetText, systemPrompt, });
      const content = result.content.trim();
      if (content) {
        return {
          systemMessage: `**Rewritten (${style}):**\n\n${content}`,
          actionPayload: { original: targetText, rewritten: content, style, },
          handled: true,
        };
      }
    } catch {
      // Fall through to local heuristic
    }
  }

  const rewritten = rewriteText(targetText, style,);
  return {
    systemMessage: `**Rewritten (${style}):**\n\n${rewritten}\n\n[LLM unavailable — applied local heuristics only]`,
    actionPayload: { original: targetText, rewritten, style, fallback: true, },
    handled: true,
  };
}

/**
 * @param args
 * @param ctx
 */
registerCommand("rewrite", (args, ctx,): CommandResult | Promise<CommandResult> => {
  return runRewrite(args, ctx, {},);
},);

/**
 * Local fallback: trim whitespace, style-based transforms, sentence punctuation.
 * @param text
 * @param style
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
