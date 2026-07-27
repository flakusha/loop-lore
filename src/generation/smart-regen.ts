/**
 * Smart Regen — Style parameter types and prompt injection for rewrites
 *
 * Provides the RegenStyle type and buildStylePrompt() for injecting
 * style instructions into the system prompt during regeneration.
 */

export const VALID_REGEN_STYLES: Record<string, string> = {
  shorter: "Rewrite significantly shorter and more concise.",
  longer: "Expand with more detail, description, and depth.",
  funnier: "Rewrite with more humor, wit, and playful energy.",
  darker: "Rewrite with a darker, more intense tone.",
  formal: "Rewrite in a more formal, articulate style.",
  casual: "Rewrite in a more casual, conversational tone.",
};

export type RegenStyle = keyof typeof VALID_REGEN_STYLES | null;

export function isValidRegenStyle(value: unknown,): value is NonNullable<RegenStyle> {
  return typeof value === "string" && value in VALID_REGEN_STYLES;
}

export interface SmartRegenRequest {
  messageId: string;
  chatId: string;
  style: RegenStyle;
  userId: string;
}

/**
 * Build a system prompt suffix for style rewrites.
 *
 * Returns an empty string when style is null/undefined (plain regen).
 * Each style maps to a clear instruction appended to the system prompt.
 */
export function buildStylePrompt(style: RegenStyle,): string {
  if (!style) { return ""; }

  const prompts: Record<NonNullable<RegenStyle>, string> = {
    shorter:
      "Rewrite your response to be significantly shorter and more concise. Keep the core meaning but cut unnecessary words.",
    longer: "Expand your response with more detail, description, and depth. Add sensory details and internal thoughts.",
    funnier: "Rewrite your response with more humor, wit, and playful energy. Add jokes, sarcasm, or comedic timing.",
    darker:
      "Rewrite your response with a darker, more intense tone. Add tension, ominous undertones, and psychological depth.",
    formal:
      "Rewrite your response in a more formal, articulate style. Use proper grammar and sophisticated vocabulary.",
    casual: "Rewrite your response in a more casual, conversational tone. Use contractions and relaxed language.",
  };

  return prompts[style] ?? "";
}
