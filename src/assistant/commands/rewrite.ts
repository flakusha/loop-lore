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

import { resolveProvider, } from "../../generation/providers/registry";
import type { GenerateRequest, } from "../../generation/providers/types";
import { type CommandContext, type CommandResult, registerCommand, } from "./registry";
import { applyRewriteToMessage, type RewriteApplyError, } from "../../chat/service";

/** Deps shape for /rewrite — matches `runCreateGeneration`'s `complete` signature. */
export interface RewriteDeps {
  complete?: (req: GenerateRequest,) => Promise<{ content: string }>;
  model?: string;
  /** Write-back for `--apply` — ownership + same-chat checked by the service. */
  apply?: (messageId: string, content: string,) => Promise<{ ok: true } | { ok: false; error: RewriteApplyError }>;
}

/**
 * Extract `--style <name>` from args, returning the chosen style and the
 * remaining positional args. Defaults to "clear".
 * @param args
 * @returns string
 */
function parseStyle(args: string[],): { style: string; rest: string[] } {
  const idx = args.indexOf("--style",);
  if (idx !== -1 && idx + 1 < args.length) {
    return { style: args[idx + 1] ?? "clear", rest: args.filter((_, i,) => i !== idx && i !== idx + 1), };
  }
  return { style: "clear", rest: args, };
}

/**
 * Core `/rewrite` logic. Extractable so tests can inject a stub `complete`.
 * The production handler resolves a provider and passes the bound `complete`
 * here, mirroring `runCreateGeneration`.
 * @param args
 * @param ctx
 * @param deps
 * @returns void
 */
export async function runRewrite(
  args: string[],
  ctx: CommandContext,
  deps: RewriteDeps,
): Promise<CommandResult> {
  const applyRequested = args.includes("--apply",);
  const { style, rest, } = parseStyle(args.filter((a,) => a !== "--apply",),);
  let targetId: string | undefined;

  let targetText: string | undefined;

  if (rest.length > 0) {
    targetText = rest.join(" ",);
  } else if (ctx.messages && ctx.messages.length > 0) {
    // Find last assistant/character message
    for (let i = ctx.messages.length - 1; i >= 0; i--) {
      const m = ctx.messages[i];
      if (m !== undefined && (m.role === "assistant" || m.role === "character")) {
        targetText = m.content;
        targetId = m.id;
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

  let rewritten: string | undefined;
  if (deps.complete) {
    try {
      const result = await deps.complete({
        model: deps.model ?? "",
        messages: [
          { role: "system", content: systemPrompt, },
          { role: "user", content: targetText, },
        ],
        params: { maxTokens: 512, temperature: 0.7, },
      },);
      const content = result.content.trim();
      if (content) {
        rewritten = content;
      }
    } catch {
      // Fall through to local heuristic
    }
  }

  const fallback = rewritten === undefined;
  const final = fallback ? rewriteText(targetText, style,) : (rewritten as string);
  if (applyRequested) {
    if (!targetId) {
      return {
        systemMessage: "**Nothing to apply to.** `--apply` rewrites the last assistant message — omit the text argument.",
        handled: true,
      };
    }
    if (!deps.apply) {
      return { systemMessage: "**Cannot apply.** Write-back needs a backend context.", handled: true, };
    }
    const applied = await deps.apply(targetId, final,);
    if (applied.ok) {
      return {
        systemMessage: `**Rewritten (${style}) and applied.**\n\n${final}`,
        actionPayload: {
          original: targetText,
          rewritten: final,
          style,
          applied: true,
          messageId: targetId,
          ...(fallback ? { fallback: true, } : {}),
        },
        handled: true,
      };
    }
    const reason = applied.error === "not_found"
      ? "The target message no longer exists."
      : applied.error === "cross_chat"
        ? "The target message belongs to another chat."
        : "You are not the author of the target message.";
    return { systemMessage: `**Cannot apply.** ${reason}`, handled: true, };
  }
  return {
    systemMessage: `**Rewritten (${style}):**\n\n${final}` +
      (fallback ? "\n\n[LLM unavailable — applied local heuristics only]" : ""),
    actionPayload: {
      original: targetText,
      rewritten: final,
      style,
      ...(fallback ? { fallback: true, } : {}),
    },
    handled: true,
  };
}

/**
 * Build the `--apply` write-back bound to this invocation's scope.
 * Returns undefined for anonymous contexts (no author to check).
 * @param ctx
 * @param db
 * @param config
 * @returns apply closure or undefined
 */
function buildApply(ctx: CommandContext, db: NonNullable<CommandContext["db"]>, config: NonNullable<CommandContext["config"]>,): RewriteDeps["apply"] {
  const userId = ctx.userId;
  if (!userId) { return undefined; }
  return (messageId: string, content: string,) => applyRewriteToMessage(db, {
    messageId,
    chatId: ctx.chatId,
    userId,
    userRole: null,
    content,
    config,
  });
}

registerCommand("rewrite", async (args, ctx,): Promise<CommandResult> => {
  const { config, db, } = ctx;
  if (!db || !config) {
    return runRewrite(args, ctx, { complete: async () => ({ content: "", }), },);
  }
  try {
    const resolved = await resolveProvider({ config, userId: ctx.userId, db, },);
    return runRewrite(args, ctx, {
      complete: (req,) => resolved.provider.complete(req,),
      model: resolved.resolvedModel,
      apply: buildApply(ctx, db, config,),
    },);
  } catch {
    return runRewrite(args, ctx, { apply: buildApply(ctx, db, config,), },);
  }
},);

/**
 * Local fallback: trim whitespace, style-based transforms, sentence punctuation.
 * @param text
 * @param style
 * @returns void
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
