// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/assistant/commands/improve.ts
//
// /improve — improve user text via the shared prompt-improvement service.
//
// The command is a thin shell over `src/prompt-improve` (see
// epic-prompt-improvement): AUX-backed LLM-first with per-level gradation
// (`--level spelling|wording|expand|strict|creative`), deterministic
// local-polish fallback otherwise. The composer UI calls the same service
// through POST /api/generation/prompt.

import { improveOrPolish, polishText, PROMPT_IMPROVE_PARAMS, type PromptImproveLevel, } from "../../prompt-improve";
import { type CommandContext, type CommandResult, registerCommand, } from "./registry";

const USAGE = "Usage: /improve <text> — rewrite text for better quality.\n" +
  "Options: --level spelling|wording|expand|strict|creative (default wording).\n" +
  "You can also reply to a message with /improve to improve it.";

/**
 * Core `/improve` logic. Delegates to the shared prompt-improvement service;
 * the service decides between the AUX LLM path and the deterministic local
 * polish fallback. Extractable for tests via the CommandContext seams.
 * @param args
 * @param ctx
 * @returns string
 */
export async function runImprove(args: string[], ctx: CommandContext,): Promise<CommandResult> {
  let level: PromptImproveLevel = "wording";
  const textParts: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--level") {
      const requested = args[i + 1] as PromptImproveLevel | undefined;
      if (requested && requested in PROMPT_IMPROVE_PARAMS) { level = requested; }
      i++;
      continue;
    }
    textParts.push(args[i] as string,);
  }
  const text = textParts.join(" ",).trim();

  if (!text) {
    return { systemMessage: USAGE, handled: true, };
  }

  // No backend context (bare unit-test ctx, headless callers): the service
  // needs config + db to resolve the aux model — degrade to local polish.
  if (!ctx.db || !ctx.config) {
    const polished = polishText(text,);
    return {
      systemMessage: `**Improved:**\n\n${polished}\n\n[LLM unavailable — applied local heuristics only]`,
      actionPayload: { original: text, improved: polished, level, fallback: true, },
      handled: true,
    };
  }

  const result = await improveOrPolish({
    level,
    text,
    config: ctx.config,
    db: ctx.db,
    userId: ctx.userId,
    chatId: ctx.chatId,
  },);
  const fallback = result.model === "local-heuristics";
  return {
    systemMessage: `**Improved:**\n\n${result.content}` +
      (fallback ? "\n\n[LLM unavailable — applied local heuristics only]" : ""),
    actionPayload: {
      original: text,
      improved: result.content,
      level,
      ...(fallback ? { fallback: true, } : {}),
    },
    handled: true,
  };
}

registerCommand("improve", async (args, ctx,): Promise<CommandResult> => runImprove(args, ctx,),);
