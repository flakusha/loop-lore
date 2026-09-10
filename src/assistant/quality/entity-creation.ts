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
 */

import { Kysely, sql, } from "kysely";
import { LorePosition, } from "../../db/enums-story";
import type { DB, } from "../../db/schema";
import { KNOWN_SUBJECT_KINDS, normalizeAudienceScope, } from "../../story/events/promote-lore";
import type { LoreSubject, } from "../lore/audience";
import type { EntityKind, } from "../prompt/templates/entity-generation";

/** Structured lore entry emitted by the LLM for `/create` entities. */
export interface GeneratedEntityLoreEntry {
  name: string;
  content: string;
  /** Keyword triggers — clamped to 5 entries, each <= 100 chars. */
  keys?: string[];
  /** Audience scope subject — validated via normalizeAudienceScope. */
  subject?: LoreSubject;
  /** Location lore is only known while the actor is present there. */
  requires_presence?: boolean;
  /** Always-on lore (not gated by selective activation). */
  constant?: boolean;
  /** Gated by keyword/scan matching rather than always-on. */
  selective?: boolean;
  /** Narrative position in the character sheet. */
  position?: LorePosition;
  insertion_order?: number;
  priority?: number;
  cooldown_seconds?: number;
}

/** Parsed fields produced by the LLM, all optional strings except `name`. */
export interface GeneratedEntity {
  name: string;
  description?: string;
  personality?: string;
  scenario?: string;
  /** Structured lore entries when the model emits `lore[]`, or prose string for backward compat. */
  lore?: string | GeneratedEntityLoreEntry[];
}

/** Maximum number of keyword keys per lore entry. */
const MAX_KEYS = 5;
/** Maximum length of a single keyword key. */
const MAX_KEY_LENGTH = 100;

/** Per-kind required field sets. `name` is always required. */
const REQUIRED_FIELDS: Record<EntityKind, string[]> = {
  character: ["name", "description",],
  location: ["name", "description",],
  world: ["name", "description",],
  item: ["name", "description",],
};

/**
 * Validate raw LLM lore entries BEFORE normalization.
 *
 * This is the pre-normalize gate: it inspects the raw `unknown[]` output from the
 * LLM and rejects entries with invalid subjects, incomplete selectors, or invalid
 * positions — issues that {@link normalizeLoreEntries} would otherwise silently
 * strip. Call this before {@link normalizeEntity} to ensure end-to-end rejection
 * of malformed lore rather than silent acceptance.
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
 * Normalize raw LLM lore entries into typed {@link GeneratedEntityLoreEntry[]}.
 *
 * Clamps `keys` to a maximum of 5 entries, each no longer than 100 characters.
 * Validates `subject` via {@link normalizeAudienceScope}. Clamps boolean flags
 * and sanitizes numeric fields to their valid ranges.
 *
 * NOTE: This function performs clamping for storage safety, not validation.
 * Validation of raw input (subject kinds, selectors, position, key count/length)
 * must be performed by {@link validateRawLoreEntries} BEFORE normalization —
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

    let position: LorePosition | undefined;
    if (typeof e.position === "string" && isValidLorePosition(e.position,)) {
      position = e.position as LorePosition;
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
 * {@link normalizeLoreEntries} clamps keys and strips invalid subjects/positions,
 * these checks are primarily effective on hand-built entries — for raw LLM
 * output, use {@link validateRawLoreEntries} which runs before clamping.
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

// ── Internal helpers ──────────────────────────────────────────────────────────

function clampNonNegativeInt(value: unknown,): number | undefined {
  if (typeof value === "number" && Number.isFinite(value,)) {
    return Math.max(0, Math.floor(value,),);
  }
  if (typeof value === "string") {
    const n = Number(value,);
    if (Number.isFinite(n,)) { return Math.max(0, Math.floor(n,),); }
  }
  return undefined;
}

function clampInt(value: unknown, min: number, max: number,): number | undefined {
  if (typeof value === "number" && Number.isFinite(value,)) {
    return Math.max(min, Math.min(max, Math.floor(value,),),);
  }
  if (typeof value === "string") {
    const n = Number(value,);
    if (Number.isFinite(n,)) { return Math.max(min, Math.min(max, Math.floor(n,),),); }
  }
  return undefined;
}

function isValidLorePosition(value: string,): boolean {
  return Object.values(LorePosition,).includes(value as LorePosition,);
}

/** Outcome of a single gate. */
export interface GateResult {
  ok: boolean;
  /** When not ok, a human-readable reason (used to reject or warn). */
  message?: string;
}

/** Aggregated quality report from {@link runQualityGates}. */
export interface QualityReport {
  /** Schema gate — hard reject when false. */
  schema: GateResult;
  /** Duplicate-name gate — warning when `duplicate.found`. */
  duplicate: { found: boolean; existingId?: string; message?: string };
  /** Consistency gate — warning when non-empty. */
  consistency: { warnings: string[] };
}

/**
 * Normalize raw LLM JSON into a typed {@link GeneratedEntity}.
 * @param raw
 * @returns void
 */
export function normalizeEntity(
  raw: Record<string, unknown>,
): GeneratedEntity {
  const str = (v: unknown,): string | undefined => {
    if (typeof v !== "string") { return undefined; }
    const trimmed = v.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  };
  return {
    name: str(raw.name,) ?? "",
    description: str(raw.description,),
    personality: str(raw.personality,),
    scenario: str(raw.scenario,),
    lore: Array.isArray(raw.lore,)
      ? normalizeLoreEntries(raw.lore,)
      : str(raw.lore,),
  };
}

/**
 * Validate the generated entity against the per-kind schema.
 * @param kind
 * @param entity
 * @returns ok=false when required fields (name, description) are missing.
 */
export function validateEntitySchema(
  kind: EntityKind,
  entity: GeneratedEntity,
): GateResult {
  const required = REQUIRED_FIELDS[kind];
  const missing: string[] = [];
  for (const f of required) {
    if (!entity[f as keyof GeneratedEntity]) { missing.push(f,); }
  }
  if (missing.length > 0) {
    return { ok: false, message: `Missing required field(s): ${missing.join(", ",)}`, };
  }
  // Validate structured lore entries when present
  if (Array.isArray(entity.lore,)) {
    const errors = validateLoreEntries(entity.lore,);
    if (errors.length > 0) {
      return { ok: false, message: `Invalid lore entries: ${errors.join("; ",)}`, };
    }
  }
  return { ok: true, };
}

/**
 * Check for an existing same-scope entity by name.
 *
 * Scoping: characters by `owner_id`; locations/items by `world_id`; worlds by
 * `owner_id`. Matching is case-insensitive on the name column.
 * @param db
 * @param kind
 * @param entity
 * @param scope
 * @param scope.ownerId
 * @param scope.worldId
 * @returns void
 */
export async function checkDuplicate(
  db: Kysely<DB>,
  kind: EntityKind,
  entity: GeneratedEntity,
  scope: { ownerId: string; worldId?: string },
): Promise<QualityReport["duplicate"]> {
  const needle = entity.name.toLowerCase();
  const lowered = sql<string>`lower(name)`;

  // Case-insensitive name match pushed into SQL: only the candidate row(s) are
  // returned instead of every owner-scoped row (O(N) JS filter removed).
  // Note: `actors` stores the entity name in `display_name` (no `name` column).
  let row: { id: string } | undefined;
  switch (kind) {
    case "character": {
      row = await db
        .selectFrom("actors",)
        .select("id",)
        .where("owner_id", "=", scope.ownerId,)
        .where(sql<string>`lower(display_name)`, "=", needle,)
        .executeTakeFirst();
      break;
    }
    case "world": {
      row = await db
        .selectFrom("worlds",)
        .select("id",)
        .where("owner_id", "=", scope.ownerId,)
        .where(lowered, "=", needle,)
        .executeTakeFirst();
      break;
    }
    case "location": {
      row = await db
        .selectFrom("locations",)
        .select("id",)
        .where("world_id", "=", scope.worldId ?? "default",)
        .where(lowered, "=", needle,)
        .executeTakeFirst();
      break;
    }
    case "item": {
      row = await db
        .selectFrom("items",)
        .select("id",)
        .where("world_id", "=", scope.worldId ?? "default",)
        .where(lowered, "=", needle,)
        .executeTakeFirst();
      break;
    }
  }

  if (row) {
    return {
      found: true,
      existingId: row.id,
      message: `A ${kind} named "${entity.name}" already exists in this scope.`,
    };
  }
  return { found: false, };
}

/**
 * Lightweight consistency check against the active world's lore/description.
 *
 * Flags when the generated description is empty where the world context is present.
 * This is a best-effort heuristic; it only ever produces warnings, never a reject.
 * @param kind
 * @param entity
 * @param worldContext
 * @param worldContext.name
 * @param worldContext.description
 * @returns void
 */
export function checkConsistency(
  kind: EntityKind,
  entity: GeneratedEntity,
  worldContext?: { name: string; description?: string | null },
): QualityReport["consistency"] {
  const warnings: string[] = [];
  if ((kind === "location" || kind === "item") && worldContext && !entity.description) {
    warnings.push(`No description provided while world "${worldContext.name}" context is available.`,);
  }
  return { warnings, };
}

/**
 * Run the full quality pipeline.
 * @param db
 * @param kind
 * @param entity
 * @param scope
 * @param scope.ownerId
 * @param scope.worldId
 * @param worldContext
 * @param worldContext.name
 * @param worldContext.description
 * @returns aggregated {@link QualityReport}; `schema.ok` false must block
 *   creation, while `duplicate.found` / `consistency.warnings` are advisory.
 */
export async function runQualityGates(
  db: Kysely<DB>,
  kind: EntityKind,
  entity: GeneratedEntity,
  scope: { ownerId: string; worldId?: string },
  worldContext?: { name: string; description?: string | null },
): Promise<QualityReport> {
  const schema = validateEntitySchema(kind, entity,);
  let duplicate: QualityReport["duplicate"] = { found: false, };
  let consistency: QualityReport["consistency"] = { warnings: [], };
  if (schema.ok) {
    duplicate = await checkDuplicate(db, kind, entity, scope,);
    consistency = checkConsistency(kind, entity, worldContext,);
  }
  return { schema, duplicate, consistency, };
}
