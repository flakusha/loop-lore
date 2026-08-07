/**
 * Character Validator — Strict and Relaxed Modes
 *
 * Validates CanonicalCharacter objects against the unified spec.
 * Strict mode enforces all constraints; relaxed mode enforces
 * mandatory fields but accepts optional fields without validation.
 */

import type {
  CanonicalCharacter,
  CharacterFeatureFlags,
  ContentRating,
  ValidationError,
  ValidationMode,
  ValidationResult,
  ValidationWarning,
} from "./spec";

// ── Field Constraints ──────────────────────────
interface FieldConstraints {
  minLength?: number;
  maxLength?: number;
  maxItems?: number;
  maxItemLength?: number;
  required: boolean;
}

const CONSTRAINTS: Record<string, FieldConstraints> = {
  name: { minLength: 1, maxLength: 64, required: true, },
  description: { minLength: 1, maxLength: 5000, required: true, },
  personality: { minLength: 1, maxLength: 2000, required: true, },
  scenario: { maxLength: 5000, required: false, },
  welcome_message: { maxLength: 5000, required: false, },
  mes_example: { maxLength: 10_000, required: false, },
  system_prompt: { maxLength: 10_000, required: false, },
  post_history_instructions: { maxLength: 5000, required: false, },
  alternate_greetings: { maxItems: 10, maxItemLength: 5000, required: false, },
  tags: { maxItems: 20, maxItemLength: 32, required: false, },
  creator: { maxLength: 64, required: false, },
  creator_notes: { maxLength: 2000, required: false, },
  character_version: { maxLength: 16, required: false, },
  nickname: { maxLength: 64, required: false, },
  nsfw_categories: { maxItems: 50, required: false, },
  nsfw_hard_limits: { maxItems: 50, required: false, },
};

const VALID_CONTENT_RATINGS: ContentRating[] = [
  "sfw",
  "nsfw_mild",
  "nsfw_moderate",
  "nsfw_intense",
  "nsfw_extreme",
];

const AGE_REQUIREMENTS: Record<ContentRating, number | null> = {
  sfw: null,
  nsfw_mild: 13,
  nsfw_moderate: 18,
  nsfw_intense: 18,
  nsfw_extreme: 18,
};

// ── Validator ────────────────────────────────────

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

// ── Individual Validators ──────────────────────────

function validateRequiredString(
  character: CanonicalCharacter,
  field: keyof CanonicalCharacter,
  errors: ValidationError[],
): void {
  const value = character[field];
  if (typeof value !== "string" || value.trim() === "") {
    errors.push({
      field: field,
      code: "REQUIRED",
      message: `${field} is required and must be a non-empty string`,
      value,
    },);
  }
}

function validateStringLength(
  character: CanonicalCharacter,
  field: string,
  errors: ValidationError[],
  warnings: ValidationWarning[],
  mode: ValidationMode,
): void {
  const charRecord = character as unknown as Record<string, unknown>;
  const value = charRecord[field];
  if (typeof value !== "string") { return; }

  const constraint = CONSTRAINTS[field];
  if (constraint?.maxLength === undefined) { return; }

  if (value.length > constraint.maxLength) {
    if (mode === "strict") {
      errors.push({
        field,
        code: "MAX_LENGTH_EXCEEDED",
        message: `${field} exceeds maximum length of ${constraint.maxLength} characters`,
        value,
      },);
    } else {
      warnings.push({
        field,
        code: "MAX_LENGTH_EXCEEDED",
        message: `${field} exceeds recommended length of ${constraint.maxLength} characters`,
        value,
      },);
    }
  }
}

function validateArrayConstraints(
  character: CanonicalCharacter,
  field: string,
  errors: ValidationError[],
  warnings: ValidationWarning[],
  mode: ValidationMode,
): void {
  const charRecord = character as unknown as Record<string, unknown>;
  const value = charRecord[field];
  if (!Array.isArray(value,)) { return; }

  const constraint = CONSTRAINTS[field];
  if (!constraint) { return; }

  if (constraint.maxItems !== undefined && value.length > constraint.maxItems) {
    if (mode === "strict") {
      errors.push({
        field,
        code: "MAX_ITEMS_EXCEEDED",
        message: `${field} exceeds maximum of ${constraint.maxItems} items`,
        value,
      },);
    } else {
      warnings.push({
        field,
        code: "MAX_ITEMS_EXCEEDED",
        message: `${field} exceeds recommended maximum of ${constraint.maxItems} items`,
        value,
      },);
    }
  }

  const maxItemLen = constraint.maxItemLength;
  for (const [i, item,] of value.entries()) {
    if (typeof item !== "string") {
      errors.push({
        field: `${field}[${i}]`,
        code: "INVALID_TYPE",
        message: `Each item in ${field} must be a string`,
        value: item,
      },);
      continue;
    }
    if (maxItemLen !== undefined && item.length > maxItemLen) {
      if (mode === "strict") {
        errors.push({
          field: `${field}[${i}]`,
          code: "MAX_LENGTH_EXCEEDED",
          message: `Item ${i} in ${field} exceeds maximum length`,
          value: item,
        },);
      } else {
        warnings.push({
          field: `${field}[${i}]`,
          code: "MAX_LENGTH_EXCEEDED",
          message: `Item ${i} in ${field} exceeds recommended length`,
          value: item,
        },);
      }
    }
  }
}

function validateContentRating(
  character: CanonicalCharacter,
  errors: ValidationError[],
  _warnings: ValidationWarning[],
): void {
  const rating = character.content_rating;
  if (rating && !VALID_CONTENT_RATINGS.includes(rating,)) {
    errors.push({
      field: "content_rating",
      code: "INVALID_VALUE",
      message: `content_rating must be one of: ${VALID_CONTENT_RATINGS.join(", ",)}`,
      value: rating,
    },);
  }
}

function validateOptionalFields(
  character: CanonicalCharacter,
  errors: ValidationError[],
  _warnings: ValidationWarning[],
): void {
  const optionalStringFields: (keyof CanonicalCharacter)[] = [
    "scenario",
    "welcome_message",
    "mes_example",
    "system_prompt",
    "post_history_instructions",
    "creator",
    "creator_notes",
    "character_version",
    "nickname",
  ];

  for (const field of optionalStringFields) {
    const value = character[field];
    if (value !== undefined && value !== null && typeof value !== "string") {
      errors.push({
        field: field,
        code: "INVALID_TYPE",
        message: `${field} must be a string if provided`,
        value,
      },);
    }
  }

  // Validate alternate_greetings is array of strings
  const greetings = character.alternate_greetings;
  if (greetings !== undefined && !Array.isArray(greetings,)) {
    errors.push({
      field: "alternate_greetings",
      code: "INVALID_TYPE",
      message: "alternate_greetings must be an array of strings",
      value: greetings,
    },);
  }

  // Validate tags is array of strings
  const tags = character.tags;
  if (tags !== undefined && !Array.isArray(tags,)) {
    errors.push({
      field: "tags",
      code: "INVALID_TYPE",
      message: "tags must be an array of strings",
      value: tags,
    },);
  }
}

function validateExtensions(
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

function validateFeatureFlags(
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

/**
 * Check if a content rating is allowed for a given age.
 */
export function isContentRatingAllowed(
  rating: ContentRating,
  userAge: number | null,
): boolean {
  const requiredAge = AGE_REQUIREMENTS[rating];
  if (requiredAge === null) { return true; }
  if (userAge === null) { return false; }
  return userAge >= requiredAge;
}

/**
 * Get the minimum age required for a content rating.
 */
export function getMinimumAge(rating: ContentRating,): number | null {
  return AGE_REQUIREMENTS[rating];
}

/**
 * Filter content ratings to only those allowed for a given age.
 */
export function filterAllowedRatings(
  ratings: ContentRating[],
  userAge: number | null,
): ContentRating[] {
  if (userAge === null) { return ["sfw",]; }
  const allowed: ContentRating[] = [];
  for (const r of ratings) { if (isContentRatingAllowed(r, userAge,)) { allowed.push(r,); } }
  return allowed;
}
