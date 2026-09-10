// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Lore-entry validation and normalization for `/create` entities.
 *
 * Two-layer defense: `validateRawLoreEntries` rejects malformed LLM output
 * BEFORE clamping; `normalizeLoreEntries` then clamps for storage safety;
 * `validateLoreEntries` is a post-normalization sanity check useful for
 * hand-built entries that bypass the LLM path.
 *
 * Split from the original `entity-creation.ts` to keep each gate in its own
 * focused module (see AGENTS.md <200L convention).
 */

import { normalizeAudienceScope, } from "../../story/events/promote-lore";
import { KNOWN_SUBJECT_KINDS, } from "../../story/events/promote-lore";
import type { LoreSubject, } from "../lore/audience";
import {
  MAX_KEYS,
  MAX_KEY_LENGTH,
  clampInt,
  clampNonNegativeInt,
  isValidLorePosition,
} from "./entity-creation-types";
import type { GeneratedEntityLoreEntry, } from "./entity-creation-types";

/**
 * Validate raw LLM lore entries BEFORE normalization.
 *
 * This is the pre-normalize gate: it inspects the raw `unknown[]` output from the
 * LLM and rejects entries with invalid subjects, incomplete selectors, or invalid
 * positions — issues that `normalizeLoreEntries` would otherwise silently strip.
 * Call this before `normalizeEntity` to ensure end-to-end rejection of malformed
 * lore rather than silent acceptance.
 * @param raw
 * @returns Array of human-readable error strings (empty when all valid).
 */
export function validateRawLoreEntries(raw: unknown[],): string[] {
  const errors: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const entry = raw[i];
    if (!entry || typeof entry !== "object") {
      errors.push(`lore[${i}] is not a valid object`,);
      continue;
    }
    const e = entry as Record<string, unknown>;

    if (typeof e.name !== "string" || e.name.trim() === "") {
      errors.push(`lore[${i}].name is required`,);
    }
    if (typeof e.content !== "string" || e.content.trim() === "") {
      errors.push(`lore[${i}].content is required`,);
    }

    if (e.keys !== undefined) {
      if (!Array.isArray(e.keys,)) {
        errors.push(`lore[${i}].keys must be an array`,);
      } else {
        if (e.keys.length > MAX_KEYS) {
          errors.push(`lore[${i}].keys exceeds ${MAX_KEYS} entries`,);
        }
        for (let j = 0; j < e.keys.length; j++) {
          if (typeof e.keys![j] !== "string" || e.keys![j]!.trim().length > MAX_KEY_LENGTH) {
            errors.push(`lore[${i}].keys[${j}] must be a string of at most ${MAX_KEY_LENGTH} characters`,);
          }
        }
      }
    }

    if (e.subject !== undefined && e.subject !== null) {
      const scope = normalizeAudienceScope({ subject: e.subject, },);
      if (!scope || !scope.subject) {
        errors.push(`lore[${i}].subject is invalid or has incomplete selectors`,);
      }
    }

    if (e.position !== undefined && typeof e.position !== "string") {
      errors.push(`lore[${i}].position must be a string`,);
    }
    if (typeof e.position === "string" && !isValidLorePosition(e.position,)) {
      errors.push(`lore[${i}].position is not a valid LorePosition`,);
    }
  }
  return errors;
}

/**
 * Normalize raw LLM lore entries into typed `GeneratedEntityLoreEntry[]`.
 *
 * Clamps `keys` to a maximum of 5 entries, each no longer than 100 characters.
 * Validates `subject` via `normalizeAudienceScope`. Clamps boolean flags
 * and sanitizes numeric fields to their valid ranges.
 *
 * NOTE: This function performs clamping for storage safety, not validation.
 * Validation of raw input (subject kinds, selectors, position, key count/length)
 * must be performed by `validateRawLoreEntries` BEFORE normalization —
 * `normalizeLoreEntries` silently strips anything it can't normalize.
 * @param raw
 */
export function normalizeLoreEntries(raw: unknown[],): GeneratedEntityLoreEntry[] {
  const result: GeneratedEntityLoreEntry[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") { continue; }
    const e = entry as Record<string, unknown>;
    const name = typeof e.name === "string" ? e.name.trim() : "";
    const content = typeof e.content === "string" ? e.content.trim() : "";
    if (!name || !content) { continue; }

    // Clamp keys: max 5 entries, each <= 100 chars
    let keys: string[] | undefined;
    if (Array.isArray(e.keys,)) {
      keys = e.keys
        .filter((k,) => typeof k === "string")
        .slice(0, MAX_KEYS,)
        .map((k,) => k.trim().slice(0, MAX_KEY_LENGTH,))
        .filter((k,) => k.length > 0);
      if (keys.length === 0) { keys = undefined; }
    }

    // Validate subject via normalizeAudienceScope (reuse from promote-lore)
    const scope = normalizeAudienceScope({ subject: e.subject, },);
    const subject = scope?.subject as LoreSubject | undefined;

    const requires_presence = typeof e.requires_presence === "boolean" ? e.requires_presence : undefined;
    const constant = typeof e.constant === "boolean" ? e.constant : undefined;
    const selective = typeof e.selective === "boolean" ? e.selective : undefined;

    let position: GeneratedEntityLoreEntry["position"];
    if (typeof e.position === "string" && isValidLorePosition(e.position,)) {
      position = e.position as GeneratedEntityLoreEntry["position"];
    }

    const insertion_order = clampNonNegativeInt(e.insertion_order,);
    const priority = clampInt(e.priority, -999, 999,);
    const cooldown_seconds = clampNonNegativeInt(e.cooldown_seconds,);

    result.push({
      name,
      content,
      keys,
      subject,
      requires_presence,
      constant,
      selective,
      position,
      insertion_order,
      priority,
      cooldown_seconds,
    },);
  }
  return result;
}

/**
 * Validate normalized lore entries (post-normalization defense-in-depth).
 *
 * Checks name/content presence, key count/length, subject kind membership,
 * and position validity on already-normalized entries. Since
 * `normalizeLoreEntries` clamps keys and strips invalid subjects/positions,
 * these checks are primarily effective on hand-built entries — for raw LLM
 * output, use `validateRawLoreEntries` which runs before clamping.
 * @param lore
 * @returns string[] of error messages (empty when all valid).
 */
export function validateLoreEntries(lore: GeneratedEntityLoreEntry[],): string[] {
  const errors: string[] = [];
  for (let i = 0; i < lore.length; i++) {
    const entry = lore[i]!;
    if (!entry.name || entry.name.length === 0) {
      errors.push(`lore[${i}].name is required`,);
    }
    if (!entry.content || entry.content.length === 0) {
      errors.push(`lore[${i}].content is required`,);
    }
    if (entry.keys && entry.keys.length > MAX_KEYS) {
      errors.push(`lore[${i}].keys exceeds ${MAX_KEYS} entries`,);
    }
    if (entry.keys) {
      for (let j = 0; j < entry.keys.length; j++) {
        if (entry.keys![j]!.length > MAX_KEY_LENGTH) {
          errors.push(`lore[${i}].keys[${j}] exceeds ${MAX_KEY_LENGTH} characters`,);
        }
      }
    }
    if (entry.subject && entry.subject.kind !== undefined && !(entry.subject.kind in KNOWN_SUBJECT_KINDS)) {
      errors.push(`lore[${i}].subject.kind is not a known subject kind`,);
    }
    if (entry.position !== undefined && !isValidLorePosition(entry.position,)) {
      errors.push(`lore[${i}].position is not a valid LorePosition`,);
    }
  }
  return errors;
}