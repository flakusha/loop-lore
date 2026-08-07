// src/characters/validator/extensions.ts — Extensions + feature-flag validators

import type {
  CanonicalCharacter,
  CharacterFeatureFlags,
  ValidationError,
  ValidationMode,
  ValidationWarning,
} from "../spec";

export function validateExtensions(
  character: CanonicalCharacter,
  errors: ValidationError[],
  warnings: ValidationWarning[],
  mode: ValidationMode,
): void {
  const extensions = character.extensions;
  if (!extensions) { return; }

  // Validate feature_flags if present
  const flags = extensions.feature_flags;
  if (flags !== undefined) {
    validateFeatureFlags(flags, errors, warnings, mode,);
  }

  // Validate inventory items if present
  const inventory = extensions.inventory;
  if (inventory !== undefined && Array.isArray(inventory,)) {
    for (const [i, item,] of inventory.entries()) {
      if (!item || typeof item !== "object") {
        errors.push({
          field: `extensions.inventory[${i}]`,
          code: "INVALID_TYPE",
          message: "Each inventory item must be an object",
          value: item,
        },);
        continue;
      }
      if (!item.name || typeof item.name !== "string") {
        errors.push({
          field: `extensions.inventory[${i}].name`,
          code: "REQUIRED",
          message: "Inventory item name is required",
          value: item.name,
        },);
      }
      if (typeof item.quantity !== "number" || item.quantity < 0) {
        if (mode === "strict") {
          errors.push({
            field: `extensions.inventory[${i}].quantity`,
            code: "INVALID_VALUE",
            message: "Inventory item quantity must be a non-negative number",
            value: item.quantity,
          },);
        } else {
          warnings.push({
            field: `extensions.inventory[${i}].quantity`,
            code: "INVALID_VALUE",
            message: "Inventory item quantity should be a non-negative number",
            value: item.quantity,
          },);
        }
      }
    }
  }

  // Validate relationships if present
  const relationships = extensions.relationships;
  if (relationships !== undefined && Array.isArray(relationships,)) {
    const validTypes = [
      "friend",
      "rival",
      "ally",
      "enemy",
      "family",
      "mentor",
      "student",
      "neutral",
    ];
    for (const [i, rel,] of relationships.entries()) {
      if (!rel || typeof rel !== "object") {
        errors.push({
          field: `extensions.relationships[${i}]`,
          code: "INVALID_TYPE",
          message: "Each relationship must be an object",
          value: rel,
        },);
        continue;
      }
      if (rel.type && !validTypes.includes(rel.type,)) {
        errors.push({
          field: `extensions.relationships[${i}].type`,
          code: "INVALID_VALUE",
          message: `Relationship type must be one of: ${validTypes.join(", ",)}`,
          value: rel.type,
        },);
      }
      if (
        typeof rel.strength !== "number" ||
        rel.strength < 0 ||
        rel.strength > 100
      ) {
        if (mode === "strict") {
          errors.push({
            field: `extensions.relationships[${i}].strength`,
            code: "INVALID_VALUE",
            message: "Relationship strength must be a number between 0 and 100",
            value: rel.strength,
          },);
        } else {
          warnings.push({
            field: `extensions.relationships[${i}].strength`,
            code: "INVALID_VALUE",
            message: "Relationship strength should be a number between 0 and 100",
            value: rel.strength,
          },);
        }
      }
    }
  }
}

export function validateFeatureFlags(
  flags: CharacterFeatureFlags,
  errors: ValidationError[],
  warnings: ValidationWarning[],
  mode: ValidationMode,
): void {
  const validKeys = new Set([
    "rpg_mechanics",
    "inventory",
    "relationships",
    "mood",
    "traits",
    "lorebook",
    "assets",
    "nsfw",
  ],);

  for (const key of Object.keys(flags,)) {
    if (!validKeys.has(key,)) {
      warnings.push({
        field: `feature_flags.${key}`,
        code: "UNKNOWN_FLAG",
        message: `Unknown feature flag: ${key}`,
        value: flags[key as keyof CharacterFeatureFlags],
      },);
    }
    const value = (flags as Record<string, unknown>)[key];
    if (typeof value !== "boolean") {
      if (mode === "strict") {
        errors.push({
          field: `feature_flags.${key}`,
          code: "INVALID_TYPE",
          message: `Feature flag ${key} must be a boolean`,
          value,
        },);
      } else {
        warnings.push({
          field: `feature_flags.${key}`,
          code: "INVALID_TYPE",
          message: `Feature flag ${key} should be a boolean`,
          value,
        },);
      }
    }
  }
}
