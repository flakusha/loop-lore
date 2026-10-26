// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

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
 * @param input - User message text
 * @param avatarConfig - Avatar template config with intent patterns
 * @returns Detected emotion key or null if no match
 */
export function detectAvatarChangeIntent(
  input: string,
  avatarConfig: AvatarTemplateConfig,
): string | null {
  const lower = input.toLowerCase();

  for (const pattern of avatarConfig.intentPatterns) {
    // An empty (or whitespace-only) pattern is a substring of every message,
    // so it would pin the avatar to its emotion for the whole session.
    const needle = pattern.pattern.trim().toLowerCase();
    if (needle.length === 0) { continue; }
    if (lower.includes(needle,)) {
      return pattern.emotion;
    }
  }

  return null;
}
