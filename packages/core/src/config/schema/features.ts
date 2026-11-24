// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/schema/features.ts — feature-profile config types

/** Supported feature profiles: a gating lens, never a config rewriter. */
export const FEATURE_PROFILES = [
  "full",
  "business-only",
  "rpg-chat-only",
  "local-only",
  "relay-only",
] as const;

export type FeatureProfile = (typeof FEATURE_PROFILES)[number];

/** Feature-profile selection. Absent means the default `full` profile. */
export interface FeaturesConfig {
  profile: FeatureProfile;
}
