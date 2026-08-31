// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Trim suggestions — budget advisor advice for a full context window.
 *
 * Pure, side-effect-free logic: given per-section token counts, decide which
 * sections consume the most budget and produce human-readable, actionable
 * guidance. Used by the chat context endpoint (FEAT-068 token budget advisor).
 */
import type { ContextSection, } from "./context-stats";

/** One actionable trim suggestion for a single budget section. */
export interface TrimSuggestion {
  /** Section name (matches prompt section registry names). */
  section: string;
  /** Tokens the section currently consumes. */
  tokens: number;
  /** Human-readable action advice for this section. */
  message: string;
}

/** Options controlling trim suggestion generation. */
export interface TrimOptions {
  /** Context usage percentage above which suggestions are emitted. Default 80. */
  thresholdPct?: number;
  /** Ignore sections smaller than this many tokens. Default 256. */
  minTokens?: number;
}

/** Default threshold above which the advisor offers suggestions. */
const DEFAULT_THRESHOLD_PCT = 80;
/** Sections under this size are not worth advising on. */
const DEFAULT_MIN_TOKENS = 256;

/**
 * Per-section advisory copy keyed by prompt section registry name.
 * `tokens` is interpolated by the caller; each entry must be a template
 * function so the recommendation reads naturally at any size.
 */
const SECTION_ADVICE: Record<string, (tokens: number,) => string> = {
  chatHistory: (tokens,) =>
    `Conversation history uses ~${tokens.toLocaleString()} tokens — archive older messages to free up budget.`,
  lore: (tokens,) =>
    `Lore entries use ~${tokens.toLocaleString()} tokens — consider pinning fewer entries or disabling lore injection.`,
  memories: (tokens,) =>
    `Memories use ~${tokens.toLocaleString()} tokens — consider lowering the memory budget or trimming low-importance entries.`,
  examples: (tokens,) =>
    `Example messages use ~${tokens.toLocaleString()} tokens — disabling example injection would free this up.`,
  postHistory: (tokens,) =>
    `Post-history instructions use ~${tokens.toLocaleString()} tokens — shorten this section to reduce overhead.`,
  storyContext: (tokens,) =>
    `Story context uses ~${tokens.toLocaleString()} tokens — condense active story/world details.`,
  dynamicContext: (tokens,) =>
    `Dynamic context uses ~${tokens.toLocaleString()} tokens — consider trimming injected state.`,
  recentEvents: (tokens,) => `Recent events use ~${tokens.toLocaleString()} tokens — reduce the event history window.`,
  characterTraits: (tokens,) =>
    `Character traits use ~${tokens.toLocaleString()} tokens — consider trimming trait entries.`,
  internalTraits: (tokens,) => `Internal traits use ~${tokens.toLocaleString()} tokens — shorten trait descriptions.`,
  nsfwContext: (tokens,) =>
    `NSFW context uses ~${tokens.toLocaleString()} tokens — review the policy/config for this section.`,
  nsfwPolicy: (tokens,) => `NSFW policy uses ~${tokens.toLocaleString()} tokens — shorten the policy text.`,
  pluginAgentRole: (tokens,) =>
    `Plugin agent role uses ~${tokens.toLocaleString()} tokens — disable unused plugin agents.`,
};

/**
 * Generate trim suggestions for a context window near capacity.
 *
 * Sorted by largest section first; only sections above `minTokens` are
 * included. Returns an empty array when the usage percentage is at or below
 * the threshold, so the advisory panel only appears once the budget is tight.
 * @param sections - Per-section token breakdown (already percentage-weighted)
 * @param usagePct - Overall context usage as a percentage (0-100)
 * @param options - Threshold and minimum-size controls
 * @returns Actionable suggestions, largest section first
 */
export function suggestTrims(
  sections: ContextSection[],
  usagePct: number,
  options: TrimOptions = {},
): TrimSuggestion[] {
  const thresholdPct = options.thresholdPct ?? DEFAULT_THRESHOLD_PCT;
  const minTokens = options.minTokens ?? DEFAULT_MIN_TOKENS;

  if (usagePct <= thresholdPct || sections.length === 0) {
    return [];
  }

  const eligible: ContextSection[] = [];
  for (const s of sections) {
    if (s.tokens >= minTokens) { eligible.push(s,); }
  }
  if (eligible.length === 0) { return []; }
  eligible.sort((a, b,) => b.tokens - a.tokens);

  const out: TrimSuggestion[] = [];
  for (const s of eligible) {
    const advise = SECTION_ADVICE[s.name];
    out.push({
      section: s.name,
      tokens: s.tokens,
      message: advise
        ? advise(s.tokens,)
        : `Section "${s.name}" uses ~${s.tokens.toLocaleString()} tokens — consider trimming it.`,
    },);
  }
  return out;
}
