// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Response Length Control (FEAT-071)
 *
 * Preset response length control — Short, Medium, Long, and Custom.
 * Users can set a default length that influences how the assistant
 * generates responses via the `max_tokens` parameter.
 */

/** Available length presets */
export type LengthPreset = "short" | "medium" | "long" | "custom";

/** Configuration stored in user settings */
export interface ResponseLengthConfig {
  preset: LengthPreset;
  customMin?: number;
  customMax?: number;
  /** Computed max_tokens passed to LLM provider */
  maxTokens: number;
}

/** Preset definitions with token ranges */
export const LENGTH_PRESETS: Record<Exclude<LengthPreset, "custom">, { label: string; min: number; max: number }> = {
  short: { label: "Short", min: 50, max: 150, },
  medium: { label: "Medium", min: 150, max: 400, },
  long: { label: "Long", min: 400, max: 1000, },
} as const;

/** Default configuration (Medium preset) */
export const DEFAULT_RESPONSE_LENGTH: ResponseLengthConfig = {
  preset: "medium",
  maxTokens: LENGTH_PRESETS.medium.max,
};

/**
 * Compute max_tokens from a preset.
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
export function computeMaxTokens(preset: LengthPreset, customMax?: number,): number {
  if (preset === "custom") {
    return Math.max(1, customMax ?? LENGTH_PRESETS.medium.max,);
  }
  return LENGTH_PRESETS[preset].max;
}

/**
 * Build a full ResponseLengthConfig from preset + optional custom values.
 *
 * @param preset - Length preset
 * @param customMin - Custom min (for custom preset)
 * @param customMax - Custom max (for custom preset)
 * @returns Complete config with computed maxTokens
 */
export function buildLengthConfig(
  preset: LengthPreset,
  customMin?: number,
  customMax?: number,
): ResponseLengthConfig {
  return {
    preset,
    customMin,
    customMax,
    maxTokens: computeMaxTokens(preset, customMax,),
  };
}

/**
 * Parse a ResponseLengthConfig from a settings JSON object.
 * @param settings - Settings object with an optional `responseLength` key
 * @returns Parsed config, or the default when absent or invalid
 */
export function parseLengthConfig(settings: Record<string, unknown> | null | undefined,): ResponseLengthConfig {
  const raw = settings?.responseLength;
  if (typeof raw !== "object" || raw === null) {
    return { ...DEFAULT_RESPONSE_LENGTH, };
  }
  const record = raw as Record<string, unknown>;
  const preset = typeof record.preset === "string" && isValidPreset(record.preset,)
    ? record.preset
    : DEFAULT_RESPONSE_LENGTH.preset;
  const customMin = typeof record.customMin === "number" ? record.customMin : undefined;
  const customMax = typeof record.customMax === "number" ? record.customMax : undefined;
  return buildLengthConfig(preset, customMin, customMax,);
}

/**
 * Check if a preset string is a valid LengthPreset.
 * @param value - String to validate
 * @returns True if valid preset
 */
export function isValidPreset(value: string,): value is LengthPreset {
  return (["short", "medium", "long", "custom",] as const).includes(value as never,);
}
