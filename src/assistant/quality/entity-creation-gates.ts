// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Quality gates for `/create` generated entities.
 *
 * Three gates — schema (hard reject), duplicate-name (advisory), consistency
 * (advisory) — plus the top-level `runQualityGates` orchestration. Split from
 * the original `entity-creation.ts` to keep the lore normalization and the gate
 * execution in separate modules (AGENTS.md <200L convention).
 */

import { Kysely, sql, } from "kysely";
import type { DB, } from "../../db/schema";
import type { EntityKind, } from "../prompt/templates/entity-generation";
import { normalizeLoreEntries, validateLoreEntries, } from "./entity-creation-lore";
import {
  type GateResult,
  type GeneratedEntity,
  type QualityReport,
  REQUIRED_FIELDS,
} from "./entity-creation-types";

/**
 * Normalize raw LLM JSON into a typed `GeneratedEntity`.
 * @param raw
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
 * @returns aggregated `QualityReport`; `schema.ok` false must block
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
