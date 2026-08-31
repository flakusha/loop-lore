// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/characters/validator/extensions.ts — Extensions + feature-flag validators

import type {
  CanonicalCharacter,
  CharacterFeatureFlags,
  ValidationError,
  ValidationMode,
  ValidationWarning,
} from "../spec";

/**
 * @param character
 * @param errors
 * @param warnings
 * @param mode
 */
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
    validateInventory(inventory, errors, warnings, mode,);
  }

  // Validate relationships if present
  const relationships = extensions.relationships;
  if (relationships !== undefined && Array.isArray(relationships,)) {
    validateRelationships(relationships, errors, warnings, mode,);
  }
}

/**
 * Validate inventory item entries.
 * @param inventory
 * @param errors
 * @param warnings
 * @param mode
 */
function validateInventory(
  inventory: unknown[],
  errors: ValidationError[],
  warnings: ValidationWarning[],
  mode: ValidationMode,
): void {
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
    const it = item as Record<string, unknown>;
    if (!it.name || typeof it.name !== "string") {
      errors.push({
        field: `extensions.inventory[${i}].name`,
        code: "REQUIRED",
        message: "Inventory item name is required",
        value: it.name,
      },);
    }
    if (typeof it.quantity !== "number" || it.quantity < 0) {
      const code = "INVALID_VALUE";
      const message = `Inventory item quantity ${mode === "strict" ? "must" : "should"} be a non-negative number`;
      const entry = { field: `extensions.inventory[${i}].quantity`, code, message, value: it.quantity, };
      if (mode === "strict") { errors.push(entry,); }
      else { warnings.push(entry,); }
    }
  }
}

/**
 * Validate relationship entries.
 * @param relationships
 * @param errors
 * @param warnings
 * @param mode
 */
function validateRelationships(
  relationships: unknown[],
  errors: ValidationError[],
  warnings: ValidationWarning[],
  mode: ValidationMode,
): void {
  const validTypes = ["friend", "rival", "ally", "enemy", "family", "mentor", "student", "neutral",];
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
    const r = rel as Record<string, unknown>;
    if (r.type && !validTypes.includes(r.type as string,)) {
      errors.push({
        field: `extensions.relationships[${i}].type`,
        code: "INVALID_VALUE",
        message: `Relationship type must be one of: ${validTypes.join(", ",)}`,
        value: r.type,
      },);
    }
    if (typeof r.strength !== "number" || r.strength < 0 || r.strength > 100) {
      const code = "INVALID_VALUE";
      const message = `Relationship strength ${mode === "strict" ? "must" : "should"} be a number between 0 and 100`;
      const entry = { field: `extensions.relationships[${i}].strength`, code, message, value: r.strength, };
      if (mode === "strict") { errors.push(entry,); }
      else { warnings.push(entry,); }
    }
  }
}

/**
 * @param flags
 * @param errors
 * @param warnings
 * @param mode
 */
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
