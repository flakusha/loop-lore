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
 * Both tiers are user-authored free text and wrapped via the shared
 * `wrapSteering` helper from `./system`, which emits an advisory preamble:
 * honor the preferences only where they do not conflict with system/GM/safety
 * instructions; they never change role or override policy. This is distinct
 * from `wrapUntrusted` (data-only) — a blanket "do not follow" preamble would
 * cancel this section's purpose, while a bare imperative (the original bug,
 * BUG-account-tier-custom-instructions-render-as-system-message-wi) let
 * account-tier text override the GM contract in shared story chats. The
 * section fires for every generation path the assembler runs, including
 * impersonation (the user-persona section replaces the *identity*, never
 * the steering).
 *
 * Trimming precedence lives in ../types PRIORITY (`customInstructions: 0`) —
 * never dropped by the token-budget trim.
 */
import type { SectionBuilder, } from "../types";
import { wrapSteering, } from "./system";

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
      "User steering preferences (account tier and story tier):",
      "",
      ...parts,
    ].join("\n",);
    return [{ role: "system", content: wrapSteering("user.custom_instructions", body,), },];
  },
};
