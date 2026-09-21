// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Smart Regen — Style parameter types for rewrite requests.
 *
 * The `style` hint is carried on each pending variant's `idempotency_key`
 * (see `chat/service/write.ts:regenerateMessageVariant`) and surfaces back
 * to the client on the regenerate response. There is intentionally no
 * prompt-injection helper here: a future ticket must wire the
 * `VALID_REGEN_STYLES` instructions into the actual prompt-assembly path
 * (currently the LLM sees raw LLM-output history, not the style hint).
 * Until that wiring exists, returning a `stylePrompt` string would lie to
 * the caller about which styles are actually being applied.
 */

export const VALID_REGEN_STYLES: Record<string, string> = {
  shorter: "Rewrite significantly shorter and more concise.",
  longer: "Expand with more detail, description, and depth.",
  funnier: "Rewrite with more humor, wit, and playful energy.",
  darker: "Rewrite with a darker, more intense tone.",
  formal: "Rewrite in a more formal, articulate style.",
  casual: "Rewrite in a more casual, conversational tone.",
};

/** */
export type RegenStyle = keyof typeof VALID_REGEN_STYLES | null;

/**
 * @param value
 */
export function isValidRegenStyle(value: unknown,): value is NonNullable<RegenStyle> {
  return typeof value === "string" && value in VALID_REGEN_STYLES;
}

/** */
export interface SmartRegenRequest {
  messageId: string;
  chatId: string;
  style: RegenStyle;
  userId: string;
}
