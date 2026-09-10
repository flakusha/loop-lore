// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Quality validation pipeline for `/create` generated entities.
 *
 * Runs before any entity is persisted. Three gates:
 *   1. Schema validation — the LLM JSON must match the expected shape.
 *   2. Duplicate check — warn if a same-scope entity with the same name exists.
 *   3. Consistency check — warn if content conflicts with the active world.
 *
 * Schema failures are hard rejects; duplicate/consistency are warnings that are
 * surfaced to the user for confirmation rather than blocking.
 *
 * The implementation is split across:
 *   - {@link ./entity-creation-types} — shared types, constants, clamp utils
 *   - {@link ./entity-creation-lore}  — lore-entry validation & normalization
 *   - {@link ./entity-creation-gates} — schema/duplicate/consistency gates
 *
 * This file remains as a re-export shim so callers that import from
 * `entity-creation` (the original path) continue to work without churn.
 */

export type {
  GeneratedEntity,
  GeneratedEntityLoreEntry,
  GateResult,
  QualityReport,
} from "./entity-creation-types";
export {
  MAX_KEYS,
  MAX_KEY_LENGTH,
  REQUIRED_FIELDS,
  clampInt,
  clampNonNegativeInt,
  isValidLorePosition,
} from "./entity-creation-types";

export {
  validateRawLoreEntries,
  normalizeLoreEntries,
  validateLoreEntries,
} from "./entity-creation-lore";

export {
  normalizeEntity,
  validateEntitySchema,
  checkDuplicate,
  checkConsistency,
  runQualityGates,
} from "./entity-creation-gates";