// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * LoRA Validation
 *
 * Validation functions for LoRA configuration and models.
 * @module generation/lora/validation
 */

import {
  LORA_EXTENSIONS,
  LORA_STRENGTH_MAX,
  LORA_STRENGTH_MIN,
  LORA_STRENGTH_TYPICAL_MAX,
  LORA_STRENGTH_TYPICAL_MIN,
} from "./types";

// ── Helpers ──────────────────────────────────────────────

/**
 * Validate a required string field in a record.
 * @param record - Record to validate
 * @param key - Field name
 * @param label - Human-readable label for error messages
 * @returns Error message or null if valid
 */
function validateRequiredString(
  record: Record<string, unknown>,
  key: string,
  label: string,
): string | null {
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    return `Invalid LoRA model ${label}`;
  }
  return null;
}

/**
 * Validate optional trigger words array.
 * @param words - Value to validate
 * @returns Error message or null if valid
 */
function validateTriggerWords(words: unknown,): string | null {
  if (words === undefined) {
    return null;
  }
  if (!Array.isArray(words,)) {
    return "LoRA triggerWords must be an array";
  }
  for (const word of words) {
    if (typeof word !== "string") {
      return "LoRA triggerWords must contain only strings";
    }
  }
  return null;
}

/**
 * Validate optional recommended strength.
 * @param value - Value to validate
 * @returns Error message or null if valid
 */
function validateRecommendedStrength(value: unknown,): string | null {
  if (value === undefined) {
    return null;
  }
  if (typeof value !== "number") {
    return "LoRA recommendedStrength must be a number";
  }
  if (value < LORA_STRENGTH_MIN || value > LORA_STRENGTH_MAX) {
    return `LoRA recommendedStrength must be between ${LORA_STRENGTH_MIN} and ${LORA_STRENGTH_MAX}`;
  }
  return null;
}

// ── Config Validation ────────────────────────────────────

/**
 * Validate a LoRA configuration object.
 * @param config - Configuration to validate
 * @returns Validation error message or null if valid
 * @example
 * ```ts
 * const error = validateLoRAConfig({ name: "my_lora", strength: 0.5, backend: "comfyui" });
 * // error === null
 *
 * const error2 = validateLoRAConfig({ name: "", strength: 1.5, backend: "invalid" });
 * // error2 === "Invalid LoRA name"
 * ```
 */
export function validateLoRAConfig(config: unknown,): string | null {
  if (!config || typeof config !== "object") {
    return "LoRA config must be an object";
  }

  const c = config as Record<string, unknown>;

  // Validate name
  if (typeof c.name !== "string" || c.name.trim().length === 0) {
    return "Invalid LoRA name";
  }

  // Validate strength
  if (typeof c.strength !== "number") {
    return "LoRA strength must be a number";
  }

  const strength = c.strength;

  // Guard against NaN/Infinity
  if (!Number.isFinite(strength,)) {
    return "LoRA strength must be a finite number";
  }

  if (strength < LORA_STRENGTH_MIN || strength > LORA_STRENGTH_MAX) {
    return `LoRA strength must be between ${LORA_STRENGTH_MIN} and ${LORA_STRENGTH_MAX}`;
  }

  // Validate backend
  if (c.backend !== "comfyui" && c.backend !== "sd-server") {
    return "LoRA backend must be 'comfyui' or 'sd-server'";
  }

  return null;
}

/**
 * Validate a LoRA model object.
 * @param model - Model to validate
 * @returns Validation error message or null if valid
 */
export function validateLoRAModel(model: unknown,): string | null {
  if (!model || typeof model !== "object") {
    return "LoRA model must be an object";
  }

  const m = model as Record<string, unknown>;

  // Validate required fields
  const nameErr = validateRequiredString(m, "name", "name",);
  if (nameErr !== null) {
    return nameErr;
  }

  const filenameErr = validateRequiredString(m, "filename", "filename",);
  if (filenameErr !== null) {
    return filenameErr;
  }

  const pathErr = validateRequiredString(m, "path", "path",);
  if (pathErr !== null) {
    return pathErr;
  }

  if (m.backend !== "comfyui" && m.backend !== "sd-server") {
    return "LoRA model backend must be 'comfyui' or 'sd-server'";
  }

  // Validate optional fields
  if (m.size !== undefined && typeof m.size !== "number") {
    return "LoRA model size must be a number";
  }

  const triggerWordsErr = validateTriggerWords(m.triggerWords,);
  if (triggerWordsErr !== null) {
    return triggerWordsErr;
  }

  const strengthErr = validateRecommendedStrength(m.recommendedStrength,);
  if (strengthErr !== null) {
    return strengthErr;
  }

  return null;
}

// ── Filename Validation ──────────────────────────────────

/**
 * Check if a filename is a valid LoRA model file.
 * @param filename - Filename to check
 * @returns True if filename has a valid LoRA extension
 */
export function isLoRAFilename(filename: string,): boolean {
  const lower = filename.toLowerCase();
  for (const ext of LORA_EXTENSIONS) {
    if (lower.endsWith(ext,)) {
      return true;
    }
  }
  return false;
}

/**
 * Extract LoRA name from filename (strip extension).
 * @param filename - LoRA model filename
 * @returns Model name without extension
 */
export function extractLoRAName(filename: string,): string {
  const lastDot = filename.lastIndexOf(".",);
  return lastDot > 0 ? filename.slice(0, Math.max(0, lastDot,),) : filename;
}

// ── Strength Helpers ─────────────────────────────────────

/**
 * Clamp LoRA strength to valid range.
 * @param strength - Input strength
 * @returns Clamped strength within [LORA_STRENGTH_MIN, LORA_STRENGTH_MAX]
 */
export function clampStrength(strength: number,): number {
  return Math.max(LORA_STRENGTH_MIN, Math.min(LORA_STRENGTH_MAX, strength,),);
}

/**
 * Check if strength is in the typical range (0.3-0.7).
 * @param strength - Strength to check
 * @returns True if strength is in typical range
 */
export function isTypicalStrength(strength: number,): boolean {
  return strength >= LORA_STRENGTH_TYPICAL_MIN && strength <= LORA_STRENGTH_TYPICAL_MAX;
}
