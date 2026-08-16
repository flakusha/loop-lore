// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Trait Categories ──────────────────────────────────────
export const TraitCategory = {
  Identity: "identity",
  Personality: "personality",
  Physical: "physical",
  Social: "social",
  Preferences: "preferences",
  Background: "background",
} as const;
export type TraitCategory = (typeof TraitCategory)[keyof typeof TraitCategory];

// ── World Trait Categories ────────────────────────────────
export const WorldTraitCategory = {
  Environmental: "environmental",
  Cultural: "cultural",
  Magical: "magical",
  Social: "social",
  Equipment: "equipment",
} as const;
export type WorldTraitCategory = (typeof WorldTraitCategory)[keyof typeof WorldTraitCategory];
