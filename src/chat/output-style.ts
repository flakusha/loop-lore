// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Output Styling — genre / register / tone control for generated text.
 *
 * Orthogonal to response *length* (owned by buildLengthConfig): styling is
 * about HOW the model writes (high fantasy, noir, cyberpunk, …), length about
 * HOW MUCH. The two compose (e.g. `long` + `cyberpunk`).
 *
 * Resolution uses the same chat → user → server fallback chain as response
 * length. Returns null when nothing is configured, so the prompt section stays
 * disabled and existing prompts are unaffected.
 */

/** Built-in output-style presets. Custom genres land later via the ECE primitive. */
export type OutputStylePreset =
  | "neutral"
  | "high_fantasy"
  | "sci_fi"
  | "modern"
  | "noir"
  | "cyberpunk"
  | "pulp"
  | "literary"
  | "horror"
  | "western";

/** Resolved output-style configuration consumed by the prompt section. */
export interface OutputStyleConfig {
  preset: OutputStylePreset;
  /** Free-form tuning instruction (bespoke voice). */
  customInstruction?: string;
  /** 0..1 — how strongly the style is imposed. */
  intensity: number;
}

/** Per-chat richer shape stored in `chats.gm_config.outputStyle`. */
export interface OutputStyleGmConfig {
  preset?: OutputStylePreset;
  customInstruction?: string;
  intensity?: number;
}

/** Curated directive text per preset — the instruction injected into context. */
export const PRESET_DIRECTIVES: Record<OutputStylePreset, string> = {
  neutral: "Write in a clear, natural register without imposed genre affectation.",
  high_fantasy:
    "Write in a high-fantasy register: archaic yet readable diction, epic scope, lush worldbuilding detail, and a mythic, elevated tone.",
  sci_fi:
    "Write in a science-fiction register: precise technical vocabulary, speculative concepts, and a cool, procedural clarity.",
  modern:
    "Write in a modern, contemporary register: plain spoken language, everyday rhythm, and casual naturalistic dialogue.",
  noir: "Write in a noir register: hard-boiled cynicism, terse sentences, moral ambiguity, and rain-slick fatalism.",
  cyberpunk:
    "Write in a cyberpunk register: neon-and-rust imagery, corporate dystopia, street slang, and jittery high-tech tension.",
  pulp:
    "Write in a pulp-adventure register: breathless pacing, vivid primary-color imagery, and larger-than-life bravado.",
  literary:
    "Write in a literary register: careful prose craft, subtext, figurative language, and psychological interiority.",
  horror:
    "Write in a horror register: creeping dread, somatic unease, degraded senses, and the suggestion of the unnatural.",
  western:
    "Write in a western register: frontier sparseness, dry humor, sun-baked terrain, and clipped, weathered speech.",
};

/**
 * Clamp intensity to 0..1 (default 0.5 when unspecified).
 * @param value
 */
export function clampIntensity(value: number | null | undefined,): number {
  if (value === null || value === undefined || Number.isNaN(value,)) { return 0.5; }
  return Math.max(0, Math.min(1, value,),);
}

/**
 * Resolve the effective output style for a chat.
 *
 * Fallback chain (first hit wins):
 *   1. Chat-level `output_style_preset` column
 *   2. Chat-level `gm_config.outputStyle` (richer shape)
 *   3. User-global `users.settings.outputStyle.preset`
 *   4. Server default from config
 * @param chatPreset
 * @param chatGmConfig
 * @param userPreset
 * @param serverDefault
 * @returns null when no preset is configured anywhere (section stays off).
 */
export function resolveOutputStyle(
  chatPreset: OutputStylePreset | null | undefined,
  chatGmConfig: OutputStyleGmConfig | null | undefined,
  userPreset: OutputStylePreset | null | undefined,
  serverDefault: OutputStylePreset | null = null,
): OutputStyleConfig | null {
  const preset = chatPreset ?? chatGmConfig?.preset ?? userPreset ?? serverDefault;
  if (!preset) { return null; }
  return {
    preset,
    customInstruction: chatGmConfig?.customInstruction,
    intensity: clampIntensity(chatGmConfig?.intensity,),
  };
}

/**
 * Build the emitted directive text for a resolved style config.
 * @param cfg
 */
export function buildStyleDirective(cfg: OutputStyleConfig,): string {
  const base = PRESET_DIRECTIVES[cfg.preset];
  const intensityLabel = cfg.intensity >= 0.75
    ? "Strongly"
    : cfg.intensity <= 0.25
    ? "Subtly"
    : "Moderately";
  const intro = `Adopt the following writing style. ${intensityLabel} favor it in every reply:`;
  const custom = cfg.customInstruction
    ? `\n\nAdditional voice guidance: ${cfg.customInstruction}`
    : "";
  return `${intro}\n${base}${custom}`;
}
