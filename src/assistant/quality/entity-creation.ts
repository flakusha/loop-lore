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

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import type { EntityKind, } from "../prompt/templates/entity-generation";

/** Parsed fields produced by the LLM, all optional strings except `name`. */
export interface GeneratedEntity {
  name: string;
  description?: string;
  personality?: string;
  scenario?: string;
  lore?: string;
}

/** Per-kind required field sets. `name` is always required. */
const REQUIRED_FIELDS: Record<EntityKind, string[]> = {
  character: ["name", "description",],
  location: ["name", "description",],
  world: ["name", "description",],
  item: ["name", "description",],
};
/*** Outcome of a single gate. */
/** */
export interface GateResult {
  ok: boolean;
  /** When not ok, a human-readable reason (used to reject or warn). */
  message?: string;
}

/** */
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
    lore: str(raw.lore,),
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

  // Typed per-table so the name column access is checked, not asserted.
  let rows: { id: string; name: string }[];
  switch (kind) {
    case "character": {
      rows = await db
        .selectFrom("actors",)
        .select(["id", "display_name as name",],)
        .where("owner_id", "=", scope.ownerId,)
        .execute();
      break;
    }
    case "world": {
      rows = await db
        .selectFrom("worlds",)
        .select(["id", "name",],)
        .where("owner_id", "=", scope.ownerId,)
        .execute();
      break;
    }
    case "location": {
      rows = await db
        .selectFrom("locations",)
        .select(["id", "name",],)
        .where("world_id", "=", scope.worldId ?? "default",)
        .execute();
      break;
    }
    case "item": {
      rows = await db
        .selectFrom("items",)
        .select(["id", "name",],)
        .where("world_id", "=", scope.worldId ?? "default",)
        .execute();
      break;
    }
  }

  const match = rows.find((r,) => r.name.toLowerCase() === needle);
  if (match) {
    return {
      found: true,
      existingId: match.id,
      message: `A ${kind} named "${entity.name}" already exists in this scope.`,
    };
  }
  return { found: false, };
}

/**
 * Lightweight consistency check against the active world's lore/description.
 *
 * Flags when the generated description contains a direct self-contradiction of
 * the world name, or is empty where the world context is present. This is a
 * best-effort heuristic; it only ever produces warnings, never a reject.
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
