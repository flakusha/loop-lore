// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Response Length Control
 *
 * Resolves per-chat response length configuration using a fallback chain:
 *   chat-specific override → user global setting → server default
 *
 * Provides preset definitions (Short/Medium/Long/Custom) and resolution logic.
 */
import type { ResponseLengthConfig, ResponseLengthPreset, } from "./types";
import { RESPONSE_LENGTH_DEFAULTS, } from "./types";

// ─── Resolution ───────────────────────────────────────────────

/**
 * Resolve the effective response length for a chat.
 *
 * Fallback chain:
 *   1. Chat-specific preset + custom value (from chats table)
 *   2. User global setting (from users.settings JSON)
 *   3. Server default from config.yaml
 * @param chatPreset - Per-chat preset from DB (null if not set)
 * @param chatCustom - Per-chat custom token count from DB (null if not set)
 * @param userPreset - User's global preference (null if not set)
 * @param serverDefault - Server default from config (default: "medium")
 * @returns Resolved configuration with effective maxTokens
 */
export function resolveResponseLength(
  chatPreset: ResponseLengthPreset | null | undefined,
  chatCustom: number | null | undefined,
  userPreset: ResponseLengthPreset | null | undefined,
  serverDefault: ResponseLengthPreset = "medium",
): ResponseLengthConfig {
  const preset = chatPreset ?? userPreset ?? serverDefault;

  if (preset === "custom") {
    const customTokens = clampTokenCount(chatCustom ?? RESPONSE_LENGTH_DEFAULTS.custom,);
    return { preset: "custom", maxTokens: customTokens, };
  }

  return {
    preset,
    maxTokens: RESPONSE_LENGTH_DEFAULTS[preset] ?? RESPONSE_LENGTH_DEFAULTS.medium,
  };
}

// ─── Validation ───────────────────────────────────────────────

/**
 * Clamp a token count to the allowed range (50–2000).
 * @param tokens - Raw token count
 * @returns Clamped value within bounds
 */
export function clampTokenCount(tokens: number,): number {
  return Math.max(50, Math.min(2000, Math.round(tokens,),),);
}

/**
 * Check if a preset string is a valid ResponseLengthPreset.
 * @param value - String to validate
 * @returns True if valid preset
 */
export function isValidPreset(value: string,): value is ResponseLengthPreset {
  return (["short", "medium", "long", "custom",] as const).includes(value as never,);
}
