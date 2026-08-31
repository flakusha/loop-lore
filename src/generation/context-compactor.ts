// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/generation/context-compactor.ts
//
// Context window compaction. When an assembled prompt crosses the
// configured fill threshold, the older half of the conversation history
// is summarized and injected as a single `[Conversation Summary]` system
// message. The most recent `keepLast` messages are always preserved so
// the model keeps short-term context.
//
// Summarization is pluggable: pass a `Summarizer` to use an LLM; by
// default an extractive fallback (no network) keeps the feature usable
// without external dependencies.

import type { GenerationMessage, } from "./gen-types-options";

/**
 * char→token heuristic (plan: chars * 0.3)
 * @param text
 */
export function estimateTokens(text: string,): number {
  return Math.ceil(text.length * 0.3,);
}

/** */
export interface CompactResult {
  messages: GenerationMessage[];
  compacted: boolean;
  summary?: string;
  droppedTokens: number;
}

/** */
export type Summarizer = (segments: string[],) => Promise<string> | string;

/** */
export interface ContextCompactorOptions {
  /** Compact once prompt exceeds this fraction of the budget. */
  threshold?: number;
  /** Always keep this many most-recent messages untouched. */
  keepLast?: number;
  /** Custom summarizer (defaults to extractive fallback). */
  summarizer?: Summarizer;
}

const SUMMARY_ROLE = "system" as const;
const SUMMARY_PREFIX = "[Conversation Summary]";

/**
 * Compacts conversation history to fit a token budget.
 * @example
 * const compactor = new ContextCompactor();
 * const { messages, compacted } = await compactor.compact(history, 32000);
 */
export class ContextCompactor {
  private readonly threshold: number;
  private readonly keepLast: number;
  private readonly summarizer: Summarizer;

  /**
   * @param options
   */
  constructor(options: ContextCompactorOptions = {},) {
    this.threshold = options.threshold ?? 0.85;
    this.keepLast = options.keepLast ?? 10;
    this.summarizer = options.summarizer ?? extractiveSummarize;
  }

  /**
   * Total estimated tokens across a message list.
   * @param messages
   */
  totalTokens(messages: GenerationMessage[],): number {
    let sum = 0;
    for (const m of messages) { sum += estimateTokens(m.content ?? "",); }
    return sum;
  }

  /**
   * Returns a compacted message list. If under threshold, input is
   * returned unchanged (compacted: false).
   * @param messages
   * @param tokenBudget
   */
  async compact(messages: GenerationMessage[], tokenBudget: number,): Promise<CompactResult> {
    const total = this.totalTokens(messages,);
    if (total <= tokenBudget * this.threshold || messages.length <= this.keepLast) {
      return { messages, compacted: false, droppedTokens: 0, };
    }

    const keep = messages.slice(-this.keepLast,);
    const older = messages.slice(0, messages.length - this.keepLast,);

    const segments = Array.from(older, (m,) => `${m.role}: ${m.content ?? ""}`,);
    const summary = await this.summarizer(segments,);

    const summaryMessage: GenerationMessage = {
      role: SUMMARY_ROLE,
      content: `${SUMMARY_PREFIX}\n${summary}`,
    };

    const droppedTokens = this.totalTokens(older,);
    return {
      messages: [summaryMessage, ...keep,],
      compacted: true,
      summary,
      droppedTokens,
    };
  }
}

/**
 * Extractive fallback: keeps the opening context and the final stretch of
 * the older window, trimmed to a sane size. No LLM required.
 * @param segments
 */
function extractiveSummarize(segments: string[],): string {
  if (segments.length === 0) { return "(no earlier context)"; }
  const head = segments.slice(0, Math.ceil(segments.length * 0.3,),);
  const tail = segments.slice(-Math.ceil(segments.length * 0.2,),);
  const parts = [...head, "…", ...tail,];
  const joined = parts.join("\n",);
  const MAX = 2000;
  return joined.length > MAX ? `${joined.slice(0, MAX,)}…` : joined;
}
