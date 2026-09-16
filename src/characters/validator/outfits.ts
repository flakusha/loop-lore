// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/characters/validator/outfits.ts — Wardrobe validators

import type {
  CanonicalCharacter,
  ValidationError,
  ValidationMode,
  ValidationWarning,
} from "../spec";

/**
 * Validate wardrobe fields: outfits catalog (≥1) + default_outfit reference.
 * Strict: missing/empty catalog and dangling default are errors.
 * Relaxed ("relaxed" param): downgraded to warnings.
 * @param character
 * @param errors
 * @param warnings
 * @param mode
 */
export function validateOutfitFields(
  character: CanonicalCharacter,
  errors: ValidationError[],
  warnings: ValidationWarning[],
  mode: ValidationMode = "strict",
): void {
  const push = (field: string, code: string, message: string, value: unknown,): void => {
    const entry = { field, code, message, value, };
    if (mode === "strict") { errors.push(entry,); }
    else { warnings.push(entry,); }
  };
  const outfits = character.outfits;
  if (!Array.isArray(outfits,) || outfits.length === 0) {
    push("outfits", "REQUIRED", "At least one outfit is required", outfits,);
    return;
  }
  if (outfits.length > 20) {
    push("outfits", "MAX_ITEMS_EXCEEDED", "outfits exceeds maximum of 20 items", outfits,);
  }
  const ids = new Set<string>();
  for (const [i, outfit,] of outfits.entries()) {
    if (!outfit || typeof outfit !== "object") {
      push(`outfits[${i}]`, "INVALID_TYPE", "Each outfit must be an object", outfit,);
      continue;
    }
    const { id, name, descriptor, } = outfit;
    if (typeof id !== "string" || id.trim() === "" || id.length > 64) {
      push(`outfits[${i}].id`, "INVALID_VALUE", "Outfit id must be a non-empty string ≤ 64 chars", id,);
    } else { ids.add(id,); }
    if (typeof name !== "string" || name.trim() === "" || name.length > 64) {
      push(`outfits[${i}].name`, "INVALID_VALUE", "Outfit name must be a non-empty string ≤ 64 chars", name,);
    }
    if (typeof descriptor !== "string" || descriptor.trim() === "" || descriptor.length > 2000) {
      push(
        `outfits[${i}].descriptor`,
        "INVALID_VALUE",
        "Outfit descriptor must be a non-empty string ≤ 2000 chars",
        descriptor,
      );
    }
  }
  const def = character.default_outfit;
  if (typeof def !== "string" || def.trim() === "") {
    push("default_outfit", "REQUIRED", "default_outfit is required and must reference outfits[].id", def,);
  } else if (!ids.has(def,)) {
    push("default_outfit", "INVALID_REFERENCE", `default_outfit "${def}" must match an outfits[].id`, def,);
  }
  const seen: Record<string, true> = {};
  for (const outfit of outfits) {
    if (outfit && typeof outfit === "object" && typeof outfit.id === "string" && outfit.id !== "") {
      if (seen[outfit.id]) {
        push("outfits", "DUPLICATE_ID", `Duplicate outfit id "${outfit.id}"`, outfit.id,);
        break;
      }
      seen[outfit.id] = true;
    }
  }
}
