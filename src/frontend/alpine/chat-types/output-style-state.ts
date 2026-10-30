// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Response length, output style, carriage, custom instructions, and per-message translation state. */
export interface ChatCoreOutputStyleState {
  _responseLengthPreset: "short" | "medium" | "long" | "custom";
  _responseLengthCustom: number;
  /** Chat-level output-style preset ("" = none). */
  _outputStylePreset:
    | ""
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
  /** How strongly the style is imposed (0–1). */
  _outputStyleIntensity: number;
  /** Hidden carriage opt-in (flat TOML episode context). */
  _carriageEnabled: boolean;
  /** Story tier of the two-tier custom instructions ("" = unset). */
  _customInstructions: string;
  /** Chat content language (gm_config.contentLanguage; "" = off). */
  _chatContentLanguage: string;
  /** Message id currently being translated (per-message translate control). */
  _mtBusy: string;
  /** message id → rendered translation variant. */
  _mtText: Record<string, { locale: string; content: string }>;
  /** Resolve the display locale for the per-message translate button. */
  mtLocale(): string;
  /** Translate a message into the resolved display locale. */
  translateMessage(messageId: string,): Promise<void>;
  /** Cached translation for a message (null = none shown). */
  translationFor(messageId: string,): { locale: string; content: string } | null;
}
