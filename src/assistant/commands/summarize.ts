// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/assistant/commands/summarize.ts
//
// /summarize — abstractive summary via the LLM when a provider resolves,
// extractive fallback (counts + excerpts) otherwise.

import { resolveProvider, } from "../../generation/providers/registry";
import type { GenerateRequest, } from "../../generation/providers/types";
import { parseIntOr, } from "../../utils/parse-number";
import { type CommandContext, type CommandResult, registerCommand, } from "./registry";

/**
 * @param args
 * @param ctx
 * @param ctx.messages
 * @returns extractive summary result
 */
function buildSummary(args: string[], ctx: { messages?: { role: string; content: string }[] },): CommandResult {
  if (!ctx.messages || ctx.messages.length === 0) {
    return { systemMessage: "No messages to summarize.", handled: true, };
  }

  const count = Math.max(1, Math.min(parseIntOr(args[0] ?? "10", 10,), ctx.messages.length,),);
  const recent = ctx.messages.slice(-count,);
  const userMsgs: typeof recent = [];
  const aiMsgs: typeof recent = [];
  for (const m of recent) {
    if (m.role === "user") { userMsgs.push(m,); }
    else if (m.role === "assistant" || m.role === "character") { aiMsgs.push(m,); }
  }

  const lines = [
    `**Conversation Summary** (last ${count} messages):`,
    "",
    `**User messages:** ${userMsgs.length}`,
    ...Array.from(userMsgs, (m,) => `- ${m.content.slice(0, 100,)}...`,),
    "",
    `**AI responses:** ${aiMsgs.length}`,
    ...Array.from(aiMsgs, (m,) => `- ${m.content.slice(0, 100,)}...`,),
  ];

  return { systemMessage: lines.join("\n",), handled: true, };
}

/** Deps shape for /summarize — matches `runCreateGeneration`'s `complete` signature. */
export interface SummarizeDeps {
  complete?: (req: GenerateRequest,) => Promise<{ content: string }>;
  model?: string;
}
/** Summary output shape for `--format` (default concise). */
export type SummarizeFormat = "concise" | "tldr" | "bullets" | "detailed";

const SUMMARIZE_FORMAT_PROMPTS: Record<SummarizeFormat, string> = {
  concise: "Summarize the following conversation concisely. Preserve key facts, decisions, and open threads.",
  tldr: "Summarize the following conversation in one or two sentences (TL;DR). Only the single most important point.",
  bullets: "Summarize the following conversation as a short bullet list. One fact, decision, or open thread per bullet.",
  detailed: "Summarize the following conversation in detail. Cover key facts, decisions, open threads, and message flow.",
};

/**
 * Extract `--format <name>` (default concise), returning the remaining args.
 * Unknown names fall back to concise; the extractive fallback ignores the flag.
 * @param args
 * @returns chosen format plus args with the flag removed
 */
function parseFormat(args: string[],): { format: SummarizeFormat; rest: string[] } {
  const idx = args.indexOf("--format",);
  if (idx === -1) { return { format: "concise", rest: args, }; }
  const requested = args[idx + 1];
  const rest = args.filter((_, i,) => i !== idx && i !== idx + 1,);
  if (requested === "tldr" || requested === "bullets" || requested === "detailed") {
    return { format: requested, rest, };
  }
  return { format: "concise", rest, };
}

/**
 * Core `/summarize` logic. Extractable so tests can inject a stub `complete`.
 * Tries the LLM first; falls back to the extractive `buildSummary`.
 * @param args
 * @param ctx
 * @param deps
 * @returns LLM abstractive summary or extractive fallback
 */
export async function runSummarize(
  args: string[],
  ctx: CommandContext,
  deps: SummarizeDeps,
): Promise<CommandResult> {
  if (!ctx.messages || ctx.messages.length === 0) {
    return { systemMessage: "No messages to summarize.", handled: true, };
  }
  const { format, rest, } = parseFormat(args,);
  const count = Math.max(1, Math.min(parseIntOr(rest[0] ?? "10", 10,), ctx.messages.length,),);
  const recent = ctx.messages.slice(-count,);
  if (deps.complete) {
    const transcript = recent
      .map((m,) => `${m.role}: ${m.content.slice(0, 500,)}`)
      .join("\n",);
    try {
      const result = await deps.complete({
        model: deps.model ?? "",
        messages: [
          {
            role: "system",
            content: SUMMARIZE_FORMAT_PROMPTS[format],
          },
          { role: "user", content: transcript, },
        ],
        params: { maxTokens: 512, temperature: 0.3, },
      },);
      const content = result.content.trim();
      if (content) {
        return {
          systemMessage: `**Conversation Summary** (last ${count} messages):\n\n${content}`,
          actionPayload: { count, summary: content, format, },
          handled: true,
        };
      }
    } catch {
      // Fall through to extractive fallback
    }
  }
  return buildSummary(rest, ctx,);
}

function resolveAndSummarize(args: string[], ctx: CommandContext,): CommandResult | Promise<CommandResult> {
  const { rest, } = parseFormat(args,);
  const { config, db, } = ctx;
  if (!db || !config) {
    return buildSummary(rest, ctx,);
  }
  return (async (): Promise<CommandResult> => {
    try {
      const resolved = await resolveProvider({ config, userId: ctx.userId, db, },);
      return runSummarize(args, ctx, {
        complete: (req,) => resolved.provider.complete(req,),
        model: resolved.resolvedModel,
      },);
    } catch {
      return buildSummary(rest, ctx,);
    }
  })();
}

registerCommand("summarize", (args, ctx,): CommandResult | Promise<CommandResult> => {
  return resolveAndSummarize(args, ctx,);
},);

registerCommand("sum", (args, ctx,): CommandResult | Promise<CommandResult> => {
  return resolveAndSummarize(args, ctx,);
},);
