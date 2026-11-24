// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Capability surface resolution: one fixed table, no config rewrites. The
// profile is a gating lens only — callers ask this resolver what is on.

import type { FeatureProfile, } from "@loop-lore/core/config/schema/features";

export { FEATURE_PROFILES, } from "@loop-lore/core/config/schema/features";
export type { FeatureProfile, } from "@loop-lore/core/config/schema/features";

/** Booleans a feature profile gates. */
export interface FeatureSurface {
  chat: boolean;
  business: boolean;
  generation: boolean;
  federation: boolean;
  plugins: boolean;
  harness: boolean;
  honeypotIntel: boolean;
  telemetry: boolean;
}

const FEATURE_MATRIX: Record<FeatureProfile, FeatureSurface> = {
  full: {
    chat: true,
    business: true,
    generation: true,
    federation: true,
    plugins: true,
    harness: true,
    honeypotIntel: true,
    telemetry: true,
  },
  "business-only": {
    chat: false,
    business: true,
    generation: false,
    federation: false,
    plugins: true,
    harness: true,
    honeypotIntel: false,
    telemetry: true,
  },
  "rpg-chat-only": {
    chat: true,
    business: false,
    generation: true,
    federation: false,
    plugins: true,
    harness: false,
    honeypotIntel: false,
    telemetry: true,
  },
  "local-only": {
    chat: true,
    business: false,
    generation: true,
    federation: false,
    plugins: true,
    harness: false,
    honeypotIntel: false,
    telemetry: false,
  },
  "relay-only": {
    chat: false,
    business: false,
    generation: false,
    federation: true,
    plugins: false,
    harness: false,
    honeypotIntel: true,
    telemetry: true,
  },
};

/**
 * Resolve a profile to its capability surface.
 * @param profile - feature profile selected by config
 * @returns the fixed surface for that profile
 */
export function resolveFeatures(profile: FeatureProfile,): FeatureSurface {
  return FEATURE_MATRIX[profile];
}
