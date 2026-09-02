// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/assistant/commands/improve.ts
//
// /improve — rewrite user text for better quality.
//
// Flow: LLM-first (when a provider resolves and `complete` is injectable),
// local-heuristics fallback otherwise. The LLM is given a clarity/flow system
// prompt; the fallback applies basic capitalization + punctuation cleanup.

import { resolveProvider, } from "../../generation/providers/registry";
import type { GenerateRequest, } from "../../generation/providers/types";
import { type CommandContext, type CommandResult, registerCommand, } from "./registry";

/** Deps shape for /improve — matches `runCreateGeneration`'s `complete` signature. */
export interface ImproveDeps {
  complete?: (req: GenerateRequest) => Promise<{ content: string }>;
  model?: string;
}

/**
 * Core `/improve` logic. Extractable so tests can inject a stub `complete`.
 * The production handler in this file resolves a provider and passes the
 * bound `complete` here, mirroring `runCreateGeneration`.
 * @param args
 * @param _ctx
 * @param deps
 */
export async function runImprove(
  args: string[],
  _ctx: CommandContext,
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
      const result = await deps.complete({
        model: deps.model ?? "",
        messages: [
          { role: "system", content: systemPrompt, },
          { role: "user", content: text, },
        ],
        params: { maxTokens: 512, temperature: 0.7, },
      },);
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

registerCommand("improve", async (args, ctx,): Promise<CommandResult> => {
  const { config, db, } = ctx;
  if (!db || !config) {
    return runImprove(args, ctx, { complete: async () => ({ content: "", }), },);
  }
  try {
    const resolved = await resolveProvider({ config, userId: ctx.userId, db, },);
    return runImprove(args, ctx, {
      complete: (req) => resolved.provider.complete(req,),
      model: resolved.resolvedModel,
    },);
  } catch {
    return runImprove(args, ctx, {},);
  }
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
