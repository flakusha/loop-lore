// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Character Validator — Strict and Relaxed Modes
 *
 * Validates CanonicalCharacter objects against the unified spec.
 * Strict mode enforces all constraints; relaxed mode enforces
 * mandatory fields but accepts optional fields without validation.
 */
import type {
  CanonicalCharacter,
  ValidationError,
  ValidationMode,
  ValidationResult,
  ValidationWarning,
} from "../spec";
import { validateContentRating, } from "./content-rating";
import { validateExtensions, } from "./extensions";
import {
  validateArrayConstraints,
  validateOptionalFields,
  validateRequiredString,
  validateStringLength,
} from "./fields";

export {
  filterAllowedRatings,
  getMinimumAge,
  isContentRatingAllowed,
} from "./content-rating";

// ── Validator ────────────────────────────────────

/**
 * @param character
 * @param mode
 */
export function validateCharacter(
  character: CanonicalCharacter,
  mode: ValidationMode = "strict",
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // ── Mandatory fields (always enforced) ──────
  validateRequiredString(character, "name", errors,);
  validateRequiredString(character, "description", errors,);
  validateRequiredString(character, "personality", errors,);

  // ── Length constraints ──────────────────────
  validateStringLength(character, "name", errors, warnings, mode,);
  validateStringLength(character, "description", errors, warnings, mode,);
  validateStringLength(character, "personality", errors, warnings, mode,);
  validateStringLength(character, "scenario", errors, warnings, mode,);
  validateStringLength(character, "welcome_message", errors, warnings, mode,);
  validateStringLength(character, "mes_example", errors, warnings, mode,);
  validateStringLength(character, "system_prompt", errors, warnings, mode,);
  validateStringLength(
    character,
    "post_history_instructions",
    errors,
    warnings,
    mode,
  );
  validateStringLength(character, "creator", errors, warnings, mode,);
  validateStringLength(character, "creator_notes", errors, warnings, mode,);
  validateStringLength(
    character,
    "character_version",
    errors,
    warnings,
    mode,
  );
  validateStringLength(character, "nickname", errors, warnings, mode,);

  // ── Array constraints ───────────────────────
  validateArrayConstraints(character, "alternate_greetings", errors, warnings, mode,);
  validateArrayConstraints(character, "tags", errors, warnings, mode,);
  validateArrayConstraints(character, "nsfw_categories", errors, warnings, mode,);
  validateArrayConstraints(character, "nsfw_hard_limits", errors, warnings, mode,);

  // ── Content rating ──────────────────────────
  validateContentRating(character, errors, warnings,);

  // ── Relaxed mode: skip optional field type validation ──
  if (mode === "strict") {
    validateOptionalFields(character, errors, warnings,);
  }

  // ── Extensions validation ───────────────────
  validateExtensions(character, errors, warnings, mode,);

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}
