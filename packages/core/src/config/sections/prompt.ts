// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/sections/prompt.ts — Prompt-assembly budget config section
//
// Replaces the hardcoded 1024-token caps in the lore and memories prompt
// sections (1.0.0 THEME 4 AC5 slice): operators tune how many tokens world
// lore and injected memories may occupy per prompt. Values outside the
// bounds are rejected at load (validate) and clamped defensively at
// construction, so a hand-built Config can never explode a prompt either.

/** Inclusive bounds for every prompt token budget. */
export const PROMPT_BUDGET_BOUNDS = {
  min: 128,
  max: 8192,
} as const;

/** Historical hardcoded cap — kept as the default so behavior is unchanged until configured. */
export const PROMPT_TOKEN_CAP_DEFAULT = 1024;

/**
 * Clamp a token budget into {@link PROMPT_BUDGET_BOUNDS}; non-finite values
 * fall back to the historical default.
 * @param value - configured budget (may be out of bounds or non-numeric)
 * @returns the clamped budget, always within bounds
 */
export function clampPromptBudget(value: number | undefined | null,): number {
  if (typeof value !== "number" || !Number.isFinite(value,)) {
    return PROMPT_TOKEN_CAP_DEFAULT;
  }

  return Math.min(PROMPT_BUDGET_BOUNDS.max, Math.max(PROMPT_BUDGET_BOUNDS.min, Math.floor(value,),),);
}

export const PROMPT_DEFAULTS = {
  loreTokenBudget: PROMPT_TOKEN_CAP_DEFAULT,
  memoryTokenBudget: PROMPT_TOKEN_CAP_DEFAULT,
};

/** */
export class PromptSection {
  loreTokenBudget = PROMPT_DEFAULTS.loreTokenBudget;
  memoryTokenBudget = PROMPT_DEFAULTS.memoryTokenBudget;

  /**
   * @param overrides - partial overrides; each budget is clamped into bounds
   */
  constructor(overrides?: Partial<PromptSection>,) {
    Object.assign(this, overrides,);
    this.loreTokenBudget = clampPromptBudget(this.loreTokenBudget,);
    this.memoryTokenBudget = clampPromptBudget(this.memoryTokenBudget,);
  }
}

export type PromptConfig = PromptSection;

export const promptMeta = {
  type: "object" as const,
  description: "Prompt-assembly token budgets",
  properties: {
    loreTokenBudget: {
      type: "integer",
      default: PROMPT_DEFAULTS.loreTokenBudget,
      description:
        `Token budget for the world-lore prompt section (${PROMPT_BUDGET_BOUNDS.min}-${PROMPT_BUDGET_BOUNDS.max}); ` +
        "constant entries are pinned, the rest compete by priority",
    },
    memoryTokenBudget: {
      type: "integer",
      default: PROMPT_DEFAULTS.memoryTokenBudget,
      description: `Token budget for injected memories (${PROMPT_BUDGET_BOUNDS.min}-${PROMPT_BUDGET_BOUNDS.max}); ` +
        "pinned memories are never dropped",
    },
  },
  required: ["loreTokenBudget", "memoryTokenBudget",] as const,
};
