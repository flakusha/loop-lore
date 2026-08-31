// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Quality validation for `/create` generated entities.
 *
 * This module provides standalone schema validation separate from the full
 * {@link runQualityGates} pipeline. Use this for early-feedback scenarios
 * where a lightweight check is preferred over the full async gate run.
 */

import type { EntityKind, } from "./prompt/templates/entity-generation";

/** Result of validating a generated entity. */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate a generated entity against its kind's schema requirements.
 *
 * This is a synchronous, lightweight check — no DB lookups or world-context
 * queries. For full quality gating including duplicate and consistency checks,
 * use {@link runQualityGates} instead.
 * @param data - The entity data to validate
 * @param entityKind - The canonical entity kind
 * @returns A validation result with `valid: true` when all required fields are present
 */
export function validateGeneratedEntity(
  data: Record<string, unknown>,
  entityKind: EntityKind,
): ValidationResult {
  const errors: string[] = [];

  if (data === null || data === undefined) {
    return { valid: false, errors: ["Entity data is null or undefined",], };
  }

  const name = data.name;
  if (typeof name !== "string" || name.trim() === "") {
    errors.push("Missing required field: name (must be a non-empty string)",);
  }

  const description = data.description;
  if (typeof description !== "string" || description.trim() === "") {
    errors.push("Missing required field: description (must be a non-empty string)",);
  }

  if (entityKind === "character") {
    if (typeof data.personality !== "string" || data.personality.trim() === "") {
      errors.push("Recommended field missing: personality",);
    }
  }

  if (entityKind === "world") {
    if (typeof data.lore !== "string" || data.lore.trim() === "") {
      errors.push("Recommended field missing: lore",);
    }
  }

  return { valid: errors.length === 0, errors, };
}
