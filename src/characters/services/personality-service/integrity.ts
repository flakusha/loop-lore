// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/characters/services/personality-service/integrity.ts — Personality integrity rules

import type { TraitCategory, } from "../../../db/enums";

/** Fields that are ALWAYS immutable (cannot be changed after creation). */
const IMMUTABLE_TRAITS: ReadonlySet<string> = new Set([
  // Identity
  "name",
  "species",
  "gender",
  "age",
  "birth_date",
  // Personality
  "personality_traits",
  "core_values",
  "fears",
  "desires",
  "alignment",
  "ideals",
  "strives",
  // Physical base
  "natural_appearance",
  "voice",
  // Background
  "homeland",
  "culture",
  "education",
],);

/** Trait categories that are entirely immutable. */
const IMMUTABLE_CATEGORIES: ReadonlySet<TraitCategory> = new Set([
  "identity",
  "personality",
  "background",
],);

/**
 * Personality lock result — describes whether a trait change is allowed.
 */
export interface PersonalityLockResult {
  allowed: boolean;
  reason: string;
  traitName: string;
  traitCategory: TraitCategory;
}

/**
 * Check if a trait modification is allowed under personality integrity rules.
 * @param traitName - The name of the trait being modified
 * @param traitCategory - The category of the trait
 * @returns Whether the modification is allowed and why
 */
export function checkPersonalityIntegrity(
  traitName: string,
  traitCategory: TraitCategory,
): PersonalityLockResult {
  // Category-level immutability
  if (IMMUTABLE_CATEGORIES.has(traitCategory,)) {
    return {
      allowed: false,
      reason: `Category '${traitCategory}' is immutable — personality cannot change`,
      traitName,
      traitCategory,
    };
  }

  // Individual trait immutability
  if (IMMUTABLE_TRAITS.has(traitName,)) {
    return {
      allowed: false,
      reason: `Trait '${traitName}' is immutable — core personality cannot change`,
      traitName,
      traitCategory,
    };
  }

  // Social category traits are immutable (friendliness, talkativity, etc.)
  // but CAN be shifted by world/story stylistic requirements
  if (traitCategory === "social") {
    return {
      allowed: true,
      reason: "Social traits can be SHIFTED by world/story requirements (not changed)",
      traitName,
      traitCategory,
    };
  }

  // Physical traits: base is immutable, but equipment overrides are allowed
  if (traitCategory === "physical" && traitName !== "natural_appearance") {
    return {
      allowed: true,
      reason: "Physical traits can be overridden by equipment/world context",
      traitName,
      traitCategory,
    };
  }

  return {
    allowed: true,
    reason: "Trait modification allowed",
    traitName,
    traitCategory,
  };
}
