/**
 * Avatar Change Intent Detection (Epic 42)
 *
 * Maps a user message to an emotion for avatar template switching, using
 * config-defined keyword patterns. Superseded the rule-based request
 * classifier (`detectIntent`) which was replaced by LLM `classifyIntent`.
 */

import type { AvatarTemplateConfig, } from "../config/sections/templates";
export type { AssistantIntent, } from "../regex/intent";

/**
 * Detect avatar change intent using config-defined patterns.
 *
 * @param input - User message text
 * @param avatarConfig - Avatar template config with intent patterns
 * @returns Detected emotion key or null if no match
 *
 * @example
 * ```typescript
 * const emotion = detectAvatarChangeIntent("She smiles warmly", avatarConfig);
 * // "happy"
 * ```
 */
export function detectAvatarChangeIntent(
  input: string,
  avatarConfig: AvatarTemplateConfig,
): string | null {
  const lower = input.toLowerCase();

  for (const pattern of avatarConfig.intentPatterns) {
    if (lower.includes(pattern.pattern.toLowerCase(),)) {
      return pattern.emotion;
    }
  }

  return null;
}
