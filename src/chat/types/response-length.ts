// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Preset for response length control */
export type ResponseLengthPreset = "short" | "medium" | "long" | "custom";

/** Resolved response length configuration */
export interface ResponseLengthConfig {
  preset: ResponseLengthPreset;
  /** Resolved max_tokens value */
  maxTokens: number;
}

/** Default token counts for each preset */
export const RESPONSE_LENGTH_DEFAULTS: Record<ResponseLengthPreset, number> = {
  short: 150,
  medium: 500,
  long: 1000,
  custom: 500, // fallback default
} as const;
