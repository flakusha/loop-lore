// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/assistant/commands/analyze.ts
//
// /analyze — analyze a draft message (intent/clarity profile) via the shared
// prompt-analysis service. Advisory only: never touches the draft.

import { analyzePrompt, type PromptAnalysis, } from "../../prompt-improve/service";
import { type CommandContext, type CommandResult, registerCommand, } from "./registry";

const USAGE = "Usage: /analyze <text> — analyze intent, clarity, and suggestions.\n" +
  "Advisory only; your text is never modified.";

/** Deps shape for /analyze — injectable so tests can stub the AUX path. */
export interface AnalyzeDeps {
  analyze?: (text: string,) => Promise<PromptAnalysis | null>;
}

/**
 * Core `/analyze` logic. Delegates to the shared prompt-analysis service;
 * degrades to an unavailable notice when no backend context exists.
 * @param args
 * @param ctx
 * @param deps
 * @returns advisory analysis profile or usage/unavailable notice
 */
export async function runAnalyze(
  args: string[],
  ctx: CommandContext,
  deps: AnalyzeDeps = {},
): Promise<CommandResult> {
  const text = args.join(" ",).trim();
  if (!text) {
    return { systemMessage: USAGE, handled: true, };
  }

  const analyze = deps.analyze ?? (async (t: string,) => {
    if (!ctx.db || !ctx.config) { return null; }
    return analyzePrompt({ text: t, config: ctx.config, db: ctx.db, userId: ctx.userId, chatId: ctx.chatId, },);
  });

  const profile = await analyze(text,);
  if (!profile) {
    return {
      systemMessage: "**Analysis unavailable** — LLM path unreachable. Your text is unchanged.",
      handled: true,
    };
  }

  const lines = [
    `**Analysis:** intent \`${profile.intent}\`, clarity ${Math.round(profile.clarity * 100,)}%`,
    "",
    ...profile.issues.map((issue,) => `- ⚠ ${issue}`),
    ...profile.suggestions.map((suggestion,) => `- → ${suggestion}`),
  ];
  return {
    systemMessage: lines.join("\n",),
    actionPayload: { original: text, ...profile, },
    handled: true,
  };
}

registerCommand("analyze", async (args, ctx,): Promise<CommandResult> => runAnalyze(args, ctx,),);
