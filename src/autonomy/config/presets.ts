// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/autonomy/config/presets.ts — Built-in pacing presets
//
// Ship three production-safe presets (serene / organic / brisk) plus
// one dev-only `unlimited-stress` preset gated on NODE_ENV.

import type { PacingPresetName, PresetDefinition, } from "./types";

/**
 * Built-in preset table. Lookup by name → definition.
 * Custom presets must be registered here in code, not via TOML config.
 */
export const PRESETS: Readonly<Record<PacingPresetName, PresetDefinition>> = {
  serene: {
    tickIntervalMs: 90_000,
    jitterRatio: 0.25,
    perAgentCap: 4,
    perUserCap: 12,
  },
  organic: {
    tickIntervalMs: 30_000,
    jitterRatio: 0.5,
    perAgentCap: 8,
    perUserCap: 24,
  },
  brisk: {
    tickIntervalMs: 10_000,
    jitterRatio: 0.2,
    perAgentCap: 12,
    perUserCap: 36,
  },
  "unlimited-stress": {
    tickIntervalMs: 1_000,
    jitterRatio: 0.0,
    perAgentCap: null,
    perUserCap: 1000,
  },
};

/** Built-in names that are always available regardless of NODE_ENV. */
export const SHIPPED_PRESETS: readonly PacingPresetName[] = [
  "serene",
  "organic",
  "brisk",
] as const;

/**
 * Dev-only preset. Rejects outside non-production environments so
 * production deploys cannot silently enable unbounded ticking.
 */
export class UnboundedStressGatedError extends Error {
  /** */
  constructor() {
    super(
      "Preset 'unlimited-stress' is dev-only; reject in NODE_ENV=production.",
    );
    this.name = "UnboundedStressGatedError";
  }
}

/**
 * Resolve a preset definition by name. Throws
 * `UnboundedStressGatedError` if `unlimited-stress` is requested
 * while NODE_ENV=production.
 * @param name Preset name to resolve.
 * @returns Preset definition.
 */
export function getPreset(name: PacingPresetName,): PresetDefinition {
  if (name === "unlimited-stress" && process.env.NODE_ENV === "production") {
    throw new UnboundedStressGatedError();
  }
  return PRESETS[name];
}
