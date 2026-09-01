// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Custom instructions section — two-tier user steering (TASK-two-tier-
 * custom-instructions).
 *
 * Two free-text tiers stack into one system message:
 *   1. account tier — `users.settings.customInstructions` (threaded through
 *      the assembler as `ctx.userCustomInstructions`), applied everywhere;
 *   2. story tier  — `chats.custom_instructions` (chat projection), stacked
 *      on top of the account tier for this story only.
 *
 * Both tiers are user-authored free text: wrapped in
 * `<untrusted_user_content>` (same marker as prompt_override — see
 * TASK-character-world-prompt-overrides-injected-verbatim-as-system) so the
 * model can distinguish steering from system truth. The section fires for
 * every generation path the assembler runs, including impersonation (the
 * user-persona section replaces the *identity*, never the steering).
 *
 * Trimming precedence lives in ../types PRIORITY (`customInstructions: 0`) —
 * never dropped by the token-budget trim.
 */
import type { SectionBuilder, } from "../types";

/** Per-tier cap; mirrors validation (`ChatUpdateBody` / settings PATCH). */
const MAX_TIER_CHARS = 5000;

/**
 * Normalize a tier value: trim, reject non-strings, clamp to the cap.
 * @param value
 */
function normalizeTier(value: string | null | undefined,): string | null {
  if (typeof value !== "string") { return null; }
  const trimmed = value.trim();
  if (trimmed.length === 0) { return null; }
  return trimmed.slice(0, MAX_TIER_CHARS,);
}

export const customInstructionsSection: SectionBuilder = {
  name: "customInstructions",
  enabled: (ctx,) =>
    normalizeTier(ctx.userCustomInstructions,) !== null ||
    normalizeTier(ctx.chat.custom_instructions,) !== null,
  build: (ctx,) => {
    const global = normalizeTier(ctx.userCustomInstructions,);
    const story = normalizeTier(ctx.chat.custom_instructions,);

    const parts: string[] = [];
    if (global) { parts.push(`[Account-wide rules — always apply]\n${global}`,); }
    if (story) { parts.push(`[Story-specific rules — stack on top of the above; on conflict these win]\n${story}`,); }
    const body = [
      "Follow these user steering instructions for every reply.",
      "",
      ...parts,
    ].join("\n",);
    return [{ role: "system", content: wrapUntrusted("user.custom_instructions", body,), },];
  },
};

/**
 * Same marker shape as the system section's override wrapping
 * (src/assistant/prompt/sections/system.ts).
 * @param source
 * @param content
 */
function wrapUntrusted(source: string, content: string,): string {
  return `<untrusted_user_content source="${source}">\n${content}\n</untrusted_user_content>`;
}
