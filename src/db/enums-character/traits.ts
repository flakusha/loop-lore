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
