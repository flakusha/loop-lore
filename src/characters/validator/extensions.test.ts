// src/characters/validator/extensions.test.ts
//
// Edge-case tests for extensions + feature-flag validators.
// Trust boundary: malformed inventory/relationship entries, boundary
// values (quantity/weight/strength 0 and 100), mode-dependent severity
// (strict error vs relaxed warning), and unknown feature-flag keys.

import { describe, expect, it, } from "bun:test";

import type {
  CanonicalCharacter,
  CharacterFeatureFlags,
  CharacterRelationship,
  InventoryItem,
  ValidationError,
  ValidationWarning,
} from "../spec";
import {
  validateExtensions,
  validateFeatureFlags,
} from "./extensions";

const baseCharacter: CanonicalCharacter = {
  name: "Test",
  description: "Test desc",
  personality: "Test personality",
  appearance: "Test appearance",
  default_outfit: "travel-gear",
  outfits: [
    { id: "travel-gear", name: "Travel Gear", descriptor: "Sturdy traveling clothes", },
  ],
};

function charWith(overrides: Record<string, unknown>,): CanonicalCharacter {
  return { ...baseCharacter, ...overrides, } as unknown as CanonicalCharacter;
}

function fresh(): { errors: ValidationError[]; warnings: ValidationWarning[] } {
  return { errors: [], warnings: [], };
}

const validInventoryItem: InventoryItem = {
  id: "sword",
  name: "Iron Sword",
  type: "weapon",
  description: "A plain blade",
  quantity: 1,
  equipped: true,
  rarity: "common",
  weight: 2.5,
};

const validRelationship: CharacterRelationship = {
  type: "friend",
  strength: 50,
  target_type: "character",
};

describe("validateExtensions", () => {
  it("produces no errors when extensions is undefined", () => {
    const { errors, warnings, } = fresh();
    validateExtensions(baseCharacter, errors, warnings, "strict",);
    expect(errors,).toHaveLength(0,);
    expect(warnings,).toHaveLength(0,);
  });

  it("produces no errors when extensions is an empty object", () => {
    const { errors, warnings, } = fresh();
    validateExtensions(charWith({ extensions: {}, },), errors, warnings, "strict",);
    expect(errors,).toHaveLength(0,);
    expect(warnings,).toHaveLength(0,);
  });

  it("delegates feature_flags validation when present", () => {
    const { errors, warnings, } = fresh();
    validateExtensions(
      charWith({ extensions: { feature_flags: { bogus_flag: true, }, }, },),
      errors,
      warnings,
      "strict",
    );
    expect(warnings.some((w,) => w.code === "UNKNOWN_FLAG"),).toBe(true,);
    expect(errors,).toHaveLength(0,);
  });

  it("skips inventory when it is not an array", () => {
    const { errors, warnings, } = fresh();
    validateExtensions(
      charWith({ extensions: { inventory: "not-an-array", }, },),
      errors,
      warnings,
      "strict",
    );
    expect(errors,).toHaveLength(0,);
    expect(warnings,).toHaveLength(0,);
  });

  it("skips relationships when it is not an array", () => {
    const { errors, warnings, } = fresh();
    validateExtensions(
      charWith({ extensions: { relationships: 42, }, },),
      errors,
      warnings,
      "strict",
    );
    expect(errors,).toHaveLength(0,);
    expect(warnings,).toHaveLength(0,);
  });

  it("accepts a fully valid inventory item", () => {
    const { errors, warnings, } = fresh();
    validateExtensions(
      charWith({ extensions: { inventory: [validInventoryItem,], }, },),
      errors,
      warnings,
      "strict",
    );
    expect(errors,).toHaveLength(0,);
    expect(warnings,).toHaveLength(0,);
  });

  it("flags null inventory items as INVALID_TYPE", () => {
    const { errors, warnings, } = fresh();
    validateExtensions(
      charWith({ extensions: { inventory: [null,] as unknown as InventoryItem[], }, },),
      errors,
      warnings,
      "strict",
    );
    expect(errors,).toHaveLength(1,);
    expect(errors[0]?.field,).toBe("extensions.inventory[0]",);
    expect(errors[0]?.code,).toBe("INVALID_TYPE",);
    expect(errors[0]?.value,).toBeNull();
    expect(warnings,).toHaveLength(0,);
  });

  it("flags non-object inventory items as INVALID_TYPE", () => {
    const { errors, warnings, } = fresh();
    validateExtensions(
      charWith({ extensions: { inventory: ["sword",] as unknown as InventoryItem[], }, },),
      errors,
      warnings,
      "strict",
    );
    expect(errors,).toHaveLength(1,);
    expect(errors[0]?.field,).toBe("extensions.inventory[0]",);
    expect(errors[0]?.code,).toBe("INVALID_TYPE",);
    expect(errors[0]?.value,).toBe("sword",);
  });

  it("flags a missing inventory item name as REQUIRED", () => {
    const { errors, warnings, } = fresh();
    const noName = { ...validInventoryItem, name: "", };
    validateExtensions(
      charWith({ extensions: { inventory: [noName,] as InventoryItem[], }, },),
      errors,
      warnings,
      "strict",
    );
    expect(errors,).toHaveLength(1,);
    expect(errors[0]?.field,).toBe("extensions.inventory[0].name",);
    expect(errors[0]?.code,).toBe("REQUIRED",);
  });

  it("flags a non-string inventory item name as REQUIRED", () => {
    const { errors, warnings, } = fresh();
    const badName = { ...validInventoryItem, name: 42, };
    validateExtensions(
      charWith({ extensions: { inventory: [badName,] as unknown as InventoryItem[], }, },),
      errors,
      warnings,
      "strict",
    );
    expect(errors,).toHaveLength(1,);
    expect(errors[0]?.field,).toBe("extensions.inventory[0].name",);
    expect(errors[0]?.code,).toBe("REQUIRED",);
    expect(errors[0]?.value,).toBe(42,);
  });

  it("flags negative quantity as an error in strict mode", () => {
    const { errors, warnings, } = fresh();
    const item = { ...validInventoryItem, quantity: -1, };
    validateExtensions(
      charWith({ extensions: { inventory: [item,] as InventoryItem[], }, },),
      errors,
      warnings,
      "strict",
    );
    expect(errors,).toHaveLength(1,);
    expect(errors[0]?.field,).toBe("extensions.inventory[0].quantity",);
    expect(errors[0]?.code,).toBe("INVALID_VALUE",);
    expect(errors[0]?.message,).toContain("must",);
    expect(warnings,).toHaveLength(0,);
  });

  it("flags negative quantity as a warning in relaxed mode", () => {
    const { errors, warnings, } = fresh();
    const item = { ...validInventoryItem, quantity: -5, };
    validateExtensions(
      charWith({ extensions: { inventory: [item,] as InventoryItem[], }, },),
      errors,
      warnings,
      "relaxed",
    );
    expect(errors,).toHaveLength(0,);
    expect(warnings,).toHaveLength(1,);
    expect(warnings[0]?.field,).toBe("extensions.inventory[0].quantity",);
    expect(warnings[0]?.code,).toBe("INVALID_VALUE",);
    expect(warnings[0]?.message,).toContain("should",);
  });

  it("flags non-numeric quantity as an error in strict mode", () => {
    const { errors, warnings, } = fresh();
    const item = { ...validInventoryItem, quantity: "lots", };
    validateExtensions(
      charWith({ extensions: { inventory: [item,] as unknown as InventoryItem[], }, },),
      errors,
      warnings,
      "strict",
    );
    expect(errors,).toHaveLength(1,);
    expect(errors[0]?.field,).toBe("extensions.inventory[0].quantity",);
  });

  it("accepts quantity of zero (boundary)", () => {
    const { errors, warnings, } = fresh();
    const item = { ...validInventoryItem, quantity: 0, };
    validateExtensions(
      charWith({ extensions: { inventory: [item,] as InventoryItem[], }, },),
      errors,
      warnings,
      "strict",
    );
    expect(errors,).toHaveLength(0,);
    expect(warnings,).toHaveLength(0,);
  });

  it("flags an invalid rarity as INVALID_VALUE", () => {
    const { errors, warnings, } = fresh();
    const item = { ...validInventoryItem, rarity: "mythic", };
    validateExtensions(
      charWith({ extensions: { inventory: [item,] as InventoryItem[], }, },),
      errors,
      warnings,
      "strict",
    );
    expect(errors,).toHaveLength(1,);
    expect(errors[0]?.field,).toBe("extensions.inventory[0].rarity",);
    expect(errors[0]?.code,).toBe("INVALID_VALUE",);
    expect(errors[0]?.message,).toContain("common",);
  });

  it("flags a non-string rarity as INVALID_VALUE", () => {
    const { errors, warnings, } = fresh();
    const item = { ...validInventoryItem, rarity: 7, };
    validateExtensions(
      charWith({ extensions: { inventory: [item,] as unknown as InventoryItem[], }, },),
      errors,
      warnings,
      "strict",
    );
    expect(errors,).toHaveLength(1,);
    expect(errors[0]?.field,).toBe("extensions.inventory[0].rarity",);
  });

  it("accepts each valid rarity", () => {
    for (const rarity of ["common", "uncommon", "rare", "epic", "legendary",]) {
      const { errors, warnings, } = fresh();
      const item = { ...validInventoryItem, rarity, };
      validateExtensions(
        charWith({ extensions: { inventory: [item,] as InventoryItem[], }, },),
        errors,
        warnings,
        "strict",
      );
      expect(errors,).toHaveLength(0,);
      expect(warnings,).toHaveLength(0,);
    }
  });

  it("ignores undefined rarity", () => {
    const { errors, warnings, } = fresh();
    const item = { ...validInventoryItem, rarity: undefined, };
    validateExtensions(
      charWith({ extensions: { inventory: [item,] as InventoryItem[], }, },),
      errors,
      warnings,
      "strict",
    );
    expect(errors,).toHaveLength(0,);
  });

  it("flags negative weight as an error in strict mode", () => {
    const { errors, warnings, } = fresh();
    const item = { ...validInventoryItem, weight: -0.5, };
    validateExtensions(
      charWith({ extensions: { inventory: [item,] as InventoryItem[], }, },),
      errors,
      warnings,
      "strict",
    );
    expect(errors,).toHaveLength(1,);
    expect(errors[0]?.field,).toBe("extensions.inventory[0].weight",);
    expect(errors[0]?.message,).toContain("must",);
  });

  it("flags negative weight as a warning in relaxed mode", () => {
    const { errors, warnings, } = fresh();
    const item = { ...validInventoryItem, weight: -1, };
    validateExtensions(
      charWith({ extensions: { inventory: [item,] as InventoryItem[], }, },),
      errors,
      warnings,
      "relaxed",
    );
    expect(errors,).toHaveLength(0,);
    expect(warnings,).toHaveLength(1,);
    expect(warnings[0]?.field,).toBe("extensions.inventory[0].weight",);
    expect(warnings[0]?.message,).toContain("should",);
  });

  it("accepts weight of zero (boundary)", () => {
    const { errors, warnings, } = fresh();
    const item = { ...validInventoryItem, weight: 0, };
    validateExtensions(
      charWith({ extensions: { inventory: [item,] as InventoryItem[], }, },),
      errors,
      warnings,
      "strict",
    );
    expect(errors,).toHaveLength(0,);
    expect(warnings,).toHaveLength(0,);
  });

  it("flags null relationship entries as INVALID_TYPE", () => {
    const { errors, warnings, } = fresh();
    validateExtensions(
      charWith({ extensions: { relationships: [null,] as unknown as CharacterRelationship[], }, },),
      errors,
      warnings,
      "strict",
    );
    expect(errors,).toHaveLength(1,);
    expect(errors[0]?.field,).toBe("extensions.relationships[0]",);
    expect(errors[0]?.code,).toBe("INVALID_TYPE",);
  });

  it("flags non-object relationship entries as INVALID_TYPE", () => {
    const { errors, warnings, } = fresh();
    validateExtensions(
      charWith({ extensions: { relationships: ["friend",] as unknown as CharacterRelationship[], }, },),
      errors,
      warnings,
      "strict",
    );
    expect(errors,).toHaveLength(1,);
    expect(errors[0]?.field,).toBe("extensions.relationships[0]",);
  });

  it("flags an unknown relationship type as INVALID_VALUE", () => {
    const { errors, warnings, } = fresh();
    const rel = { ...validRelationship, type: "nemesis", };
    validateExtensions(
      charWith({ extensions: { relationships: [rel,] as unknown as CharacterRelationship[], }, },),
      errors,
      warnings,
      "strict",
    );
    expect(errors,).toHaveLength(1,);
    expect(errors[0]?.field,).toBe("extensions.relationships[0].type",);
    expect(errors[0]?.code,).toBe("INVALID_VALUE",);
    expect(errors[0]?.value,).toBe("nemesis",);
  });

  it("accepts each valid relationship type", () => {
    for (
      const type of [
        "friend",
        "rival",
        "ally",
        "enemy",
        "family",
        "mentor",
        "student",
        "neutral",
        "lover",
        "debt",
        "grudge",
      ]
    ) {
      const { errors, warnings, } = fresh();
      const rel = { ...validRelationship, type, };
      validateExtensions(
        charWith({ extensions: { relationships: [rel,] as unknown as CharacterRelationship[], }, },),
        errors,
        warnings,
        "strict",
      );
      expect(errors,).toHaveLength(0,);
      expect(warnings,).toHaveLength(0,);
    }
  });

  it("flags negative strength as an error in strict mode", () => {
    const { errors, warnings, } = fresh();
    const rel = { ...validRelationship, strength: -1, };
    validateExtensions(
      charWith({ extensions: { relationships: [rel,] as CharacterRelationship[], }, },),
      errors,
      warnings,
      "strict",
    );
    expect(errors,).toHaveLength(1,);
    expect(errors[0]?.field,).toBe("extensions.relationships[0].strength",);
    expect(errors[0]?.message,).toContain("must",);
  });

  it("flags strength over 100 as an error in strict mode", () => {
    const { errors, warnings, } = fresh();
    const rel = { ...validRelationship, strength: 101, };
    validateExtensions(
      charWith({ extensions: { relationships: [rel,] as CharacterRelationship[], }, },),
      errors,
      warnings,
      "strict",
    );
    expect(errors,).toHaveLength(1,);
    expect(errors[0]?.field,).toBe("extensions.relationships[0].strength",);
  });

  it("flags out-of-range strength as a warning in relaxed mode", () => {
    const { errors, warnings, } = fresh();
    const rel = { ...validRelationship, strength: 250, };
    validateExtensions(
      charWith({ extensions: { relationships: [rel,] as CharacterRelationship[], }, },),
      errors,
      warnings,
      "relaxed",
    );
    expect(errors,).toHaveLength(0,);
    expect(warnings,).toHaveLength(1,);
    expect(warnings[0]?.field,).toBe("extensions.relationships[0].strength",);
    expect(warnings[0]?.message,).toContain("should",);
  });

  it("flags non-numeric strength", () => {
    const { errors, warnings, } = fresh();
    const rel = { ...validRelationship, strength: "high", };
    validateExtensions(
      charWith({ extensions: { relationships: [rel,] as unknown as CharacterRelationship[], }, },),
      errors,
      warnings,
      "strict",
    );
    expect(errors,).toHaveLength(1,);
    expect(errors[0]?.field,).toBe("extensions.relationships[0].strength",);
  });

  it("accepts strength boundaries 0 and 100", () => {
    for (const strength of [0, 100,]) {
      const { errors, warnings, } = fresh();
      const rel = { ...validRelationship, strength, };
      validateExtensions(
        charWith({ extensions: { relationships: [rel,] as CharacterRelationship[], }, },),
        errors,
        warnings,
        "strict",
      );
      expect(errors,).toHaveLength(0,);
      expect(warnings,).toHaveLength(0,);
    }
  });

  it("flags an invalid target_type as INVALID_VALUE", () => {
    const { errors, warnings, } = fresh();
    const rel = { ...validRelationship, target_type: "concept", };
    validateExtensions(
      charWith({ extensions: { relationships: [rel,] as unknown as CharacterRelationship[], }, },),
      errors,
      warnings,
      "strict",
    );
    expect(errors,).toHaveLength(1,);
    expect(errors[0]?.field,).toBe("extensions.relationships[0].target_type",);
    expect(errors[0]?.code,).toBe("INVALID_VALUE",);
  });

  it("accepts each valid target_type", () => {
    for (const target_type of ["character", "faction", "place", "object",]) {
      const { errors, warnings, } = fresh();
      const rel = { ...validRelationship, target_type, };
      validateExtensions(
        charWith({ extensions: { relationships: [rel,] as unknown as CharacterRelationship[], }, },),
        errors,
        warnings,
        "strict",
      );
      expect(errors,).toHaveLength(0,);
      expect(warnings,).toHaveLength(0,);
    }
  });

  it("ignores undefined target_type", () => {
    const { errors, warnings, } = fresh();
    const rel = { ...validRelationship, target_type: undefined, };
    validateExtensions(
      charWith({ extensions: { relationships: [rel,] as CharacterRelationship[], }, },),
      errors,
      warnings,
      "strict",
    );
    expect(errors,).toHaveLength(0,);
  });

  it("reports errors for multiple bad entries with correct indices", () => {
    const { errors, warnings, } = fresh();
    validateExtensions(
      charWith({
        extensions: {
          inventory: [null, validInventoryItem, { name: "x", quantity: -3, },] as unknown as InventoryItem[],
        },
      },),
      errors,
      warnings,
      "strict",
    );
    expect(errors.some((e,) => e.field === "extensions.inventory[0]"),).toBe(true,);
    expect(errors.some((e,) => e.field === "extensions.inventory[2].quantity"),).toBe(true,);
    expect(errors.some((e,) => e.field === "extensions.inventory[1]"),).toBe(false,);
  });
});

describe("validateFeatureFlags", () => {
  it("accepts empty flags", () => {
    const { errors, warnings, } = fresh();
    validateFeatureFlags({}, errors, warnings, "strict",);
    expect(errors,).toHaveLength(0,);
    expect(warnings,).toHaveLength(0,);
  });

  it("accepts all valid boolean flags", () => {
    const { errors, warnings, } = fresh();
    const flags: CharacterFeatureFlags = {
      rpg_mechanics: true,
      inventory: false,
      relationships: true,
      mood: false,
      traits: true,
      lorebook: false,
      assets: true,
      nsfw: false,
    };
    validateFeatureFlags(flags, errors, warnings, "strict",);
    expect(errors,).toHaveLength(0,);
    expect(warnings,).toHaveLength(0,);
  });

  it("warns on unknown flag keys", () => {
    const { errors, warnings, } = fresh();
    const flags = { super_powers: true, } as unknown as CharacterFeatureFlags;
    validateFeatureFlags(flags, errors, warnings, "strict",);
    expect(errors,).toHaveLength(0,);
    expect(warnings,).toHaveLength(1,);
    expect(warnings[0]?.field,).toBe("feature_flags.super_powers",);
    expect(warnings[0]?.code,).toBe("UNKNOWN_FLAG",);
    expect(warnings[0]?.value,).toBe(true,);
  });

  it("errors on a non-boolean flag value in strict mode", () => {
    const { errors, warnings, } = fresh();
    const flags = { nsfw: "yes", } as unknown as CharacterFeatureFlags;
    validateFeatureFlags(flags, errors, warnings, "strict",);
    expect(errors,).toHaveLength(1,);
    expect(errors[0]?.field,).toBe("feature_flags.nsfw",);
    expect(errors[0]?.code,).toBe("INVALID_TYPE",);
    expect(errors[0]?.message,).toContain("must",);
    expect(warnings,).toHaveLength(0,);
  });

  it("warns on a non-boolean flag value in relaxed mode", () => {
    const { errors, warnings, } = fresh();
    const flags = { mood: 1, } as unknown as CharacterFeatureFlags;
    validateFeatureFlags(flags, errors, warnings, "relaxed",);
    expect(errors,).toHaveLength(0,);
    expect(warnings,).toHaveLength(1,);
    expect(warnings[0]?.field,).toBe("feature_flags.mood",);
    expect(warnings[0]?.code,).toBe("INVALID_TYPE",);
    expect(warnings[0]?.message,).toContain("should",);
  });

  it("reports both UNKNOWN_FLAG and INVALID_TYPE for an unknown non-boolean key", () => {
    const { errors, warnings, } = fresh();
    const flags = { custom_flag: "x", } as unknown as CharacterFeatureFlags;
    validateFeatureFlags(flags, errors, warnings, "strict",);
    expect(warnings.some((w,) => w.code === "UNKNOWN_FLAG"),).toBe(true,);
    expect(errors.some((e,) => e.code === "INVALID_TYPE"),).toBe(true,);
  });

  it("warns for identity_lore (valid interface key absent from the validator set)", () => {
    const { errors, warnings, } = fresh();
    const flags: CharacterFeatureFlags = { identity_lore: true, };
    validateFeatureFlags(flags, errors, warnings, "strict",);
    expect(errors,).toHaveLength(0,);
    expect(warnings,).toHaveLength(1,);
    expect(warnings[0]?.code,).toBe("UNKNOWN_FLAG",);
    expect(warnings[0]?.field,).toBe("feature_flags.identity_lore",);
  });
});
