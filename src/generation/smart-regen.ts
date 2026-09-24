// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Smart Regen — Style parameter types for rewrite requests.
 *
 * The `style` hint is carried on each pending variant's `idempotency_key`
 * (see `chat/service/write.ts:regenerateMessageVariant`) and surfaces back
 * to the client on the regenerate response. The regenerate route now also
 * drives the generation for the pending variant, appending the style
 * instruction to the LLM payload's system message via `appendStylePrompt`
 * (BUG-smart-regen-style-not-threaded-through).
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

/**
 * Style instruction for the LLM system prompt. Unknown values (possible via
 * unchecked request casts) yield null so callers skip the injection.
 * @param style
 * @returns instruction text, or null when there is nothing to apply
 */
export function buildStylePrompt(style: RegenStyle,): string | null {
  if (style === null) { return null; }
  const instruction = VALID_REGEN_STYLES[style];
  return instruction ?? null;
}

/** Structural minimum needed to append the style instruction. */
interface StylePromptTarget {
  role: string;
  content: string;
}

/**
 * Append a style instruction to the FIRST system-role message (creating one
 * when the prompt has none) so the provider payload actually carries it —
 * the assembler's separate `systemPrompt` string is metadata, not payload,
 * and later system-role entries are auxiliary sections (actor header,
 * persona), not the main system prompt. Input is never mutated.
 * @param messages
 * @param stylePrompt
 * @returns new message array
 */
export function appendStylePrompt<T extends StylePromptTarget,>(
  messages: readonly T[],
  stylePrompt: string,
): T[] {
  let firstSystemIndex = -1;
  for (let i = 0; i < messages.length; i++) {
    if (messages[i]?.role === "system") {
      firstSystemIndex = i;
      break;
    }
  }
  if (firstSystemIndex === -1) {
    return [{ role: "system", content: stylePrompt, } as T, ...messages,];
  }
  const updated = [...messages,];
  const target = updated[firstSystemIndex] as StylePromptTarget;
  updated[firstSystemIndex] = {
    ...target,
    content: `${target.content}\n\n${stylePrompt}`,
  } as T;
  return updated;
}

/** */
export interface SmartRegenRequest {
  messageId: string;
  chatId: string;
  style: RegenStyle;
  userId: string;
}
