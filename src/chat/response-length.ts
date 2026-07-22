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
 * @param preset - Length preset
 * @param customMax - Custom max for "custom" preset
 * @returns Token count for max_tokens parameter
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
 * Parse a ResponseLengthConfig from a user settings JSON blob.
 * Returns default if missing or invalid.
 *
 * @param settings - Parsed user settings object
 * @returns Validated config or default
 */
export function parseLengthConfig(settings: Record<string, unknown> | null | undefined,): ResponseLengthConfig {
  if (!settings?.responseLength) {
    return { ...DEFAULT_RESPONSE_LENGTH, };
  }

  const raw = settings.responseLength as Record<string, unknown>;
  const preset = raw.preset as string;
  const validPresets: LengthPreset[] = ["short", "medium", "long", "custom",];

  if (!validPresets.includes(preset as LengthPreset,)) {
    return { ...DEFAULT_RESPONSE_LENGTH, };
  }

  return buildLengthConfig(
    preset as LengthPreset,
    raw.customMin as number | undefined,
    raw.customMax as number | undefined,
  );
}
