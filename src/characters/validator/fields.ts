// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/characters/validator/fields.ts — Field-level validators

import type {
  CanonicalCharacter,
  ValidationError,
  ValidationMode,
  ValidationWarning,
} from "../spec";
import type { GrowthMode, } from "../spec/growth";
import { GrowthMode as GrowthModeEnum, } from "../spec/growth";
import { CONSTRAINTS, } from "./constants";

/**
 * @param character
 * @param field
 * @param errors
 */
export function validateRequiredString(
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

/**
 * @param character
 * @param field
 * @param errors
 * @param warnings
 * @param mode
 */
export function validateStringLength(
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

/**
 * @param character
 * @param field
 * @param errors
 * @param warnings
 * @param mode
 */
export function validateArrayConstraints(
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

/**
 * @param character
 * @param errors
 * @param _warnings
 */
export function validateOptionalFields(
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

const VALID_GROWTH_MODES: Readonly<Record<GrowthMode, true>> = {
  [GrowthModeEnum.Dynamic]: true,
  [GrowthModeEnum.Static]: true,
};

/**
 * Validate the character growth-mode + llm-assist toggle fields.
 *
 * Per `.plan/epics/epic-character-growth.md`:
 * - `growth_mode` must be one of `'dynamic' | 'static'` when provided
 * - `llm_assist_enabled` must be a boolean when provided
 * - Both fields are optional: relaxed mode accepts their absence
 *
 * @param character
 * @param errors
 */
export function validateGrowthFields(
  character: CanonicalCharacter,
  errors: ValidationError[],
): void {
  const record = character as unknown as Record<string, unknown>;

  const mode = record["growth_mode"];
  if (mode !== undefined && mode !== null) {
    if (typeof mode !== "string" || !(mode in VALID_GROWTH_MODES)) {
      errors.push({
        field: "growth_mode",
        code: "INVALID_VALUE",
        message: `growth_mode must be one of ${Object.keys(VALID_GROWTH_MODES,).join(", ",)}`,
        value: mode,
      },);
    }
  }

  const llmAssist = record["llm_assist_enabled"];
  if (llmAssist !== undefined && llmAssist !== null && typeof llmAssist !== "boolean") {
    errors.push({
      field: "llm_assist_enabled",
      code: "INVALID_TYPE",
      message: "llm_assist_enabled must be a boolean",
      value: llmAssist,
    },);
  }
}
