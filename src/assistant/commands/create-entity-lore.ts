// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Lore-persistence half of `insertGeneratedEntity`.
 *
 * Resolves the target lore table (`world_lore_entries` for world/location/item,
 * `actor_lore_entries` for character) and inserts one row per `GeneratedEntityLoreEntry`,
 * including audience-scope JSON serialization and the N6 selective/keys guard.
 *
 * Split out of `create-entity.ts` to keep the per-kind entity insert switch and
 * the lore-row builder in separate modules (AGENTS.md <200L convention).
 */

import type { Kysely, } from "kysely";
import { LoreEntryStatus, LorePosition, } from "../../db/enums-story";
import type { DB, } from "../../db/schema";
import { normalizeAudienceScope, } from "../../story/events/promote-lore";
import { safeJsonStringify, } from "../../utils";
import type { LoreScope, } from "../lore/audience";
import type { EntityKind, } from "../prompt/templates/entity-generation";
import type { GeneratedEntityLoreEntry, } from "../quality/entity-creation";

/**
 * Map an EntityKind to its target lore table.
 */
interface LoreTarget {
  table: "world_lore_entries" | "actor_lore_entries";
  fkColumn: "world_id" | "actor_id";
}

/** Resolve the lore target table and FK column for a given entity kind. */
function resolveLoreTarget(kind: EntityKind,): LoreTarget | null {
  switch (kind) {
    case "world":
    case "location":
    case "item":
      return { table: "world_lore_entries", fkColumn: "world_id", };
    case "character":
      return { table: "actor_lore_entries", fkColumn: "actor_id", };
  }
}

/**
 * Insert structured lore entries for a generated entity into the appropriate
 * lore table(s). Each entry becomes a separate row.
 *
 * - world → world_lore_entries (world_id = the world's id)
 * - location → world_lore_entries (world_id = the parent world)
 * - item → world_lore_entries (world_id = the parent world)
 * - character → actor_lore_entries (actor_id = the character's id)
 *
 * Location and item lore entries get `requires_presence = true` by default.
 * Entries with `selective = true` but empty keys are stored with `selective = 0`
 * since keyword matching cannot fire without triggers.
 * @param db       - Database handle (or open transaction)
 * @param kind     - Entity kind (determines target table)
 * @param entityId - The newly-inserted entity's id
 * @param worldId  - Resolved world id (required for world/loc/item; null for character)
 * @param lore     - Structured lore entries from the normalized entity
 * @throws when worldId is missing for a kind that requires it
 */
export async function insertEntityLore(
  db: Kysely<DB>,
  kind: EntityKind,
  entityId: string,
  worldId: string | undefined,
  lore: string | GeneratedEntityLoreEntry[] | undefined,
): Promise<void> {
  if (!Array.isArray(lore,)) { return; }
  if (lore.length === 0) { return; }

  const target = resolveLoreTarget(kind,);
  if (!target) { return; }

  // world/location/item lore is stored in world_lore_entries which has a
  // NOT NULL FK on world_id — the world must be known.
  if (target.table === "world_lore_entries" && !worldId) {
    throw new Error(`worldId is required for ${kind} lore persistence,`,);
  }

  const now = new Date().toISOString();

  for (const entry of lore) {
    // Build audience_scope JSON from subject + requires_presence.
    // For location/item lore without a subject, attach a synthetic
    // { kind: "location", locationId: entityId } so parseLoreScope can
    // read it back (it requires a subject key) and requires_presence
    // is meaningful in isLoreVisibleTo.
    const scope: LoreScope = {};
    if (entry.subject) {
      scope.subject = entry.subject;
    } else if (kind === "location" || kind === "item") {
      scope.subject = { kind: "location" as const, locationId: entityId, };
    }

    if (kind === "location" || kind === "item") {
      scope.requires_presence = entry.requires_presence ?? true;
    } else if (entry.requires_presence !== undefined) {
      scope.requires_presence = entry.requires_presence;
    }

    // Validate subject via normalizeAudienceScope (checks kind + selectors).
    // If subject is present but invalid, skip this entry.
    const validated = normalizeAudienceScope(scope,);
    if (entry.subject && !validated) { continue; }

    // Serialize the scope directly — preserves requires_presence + subject.
    // Store null when scope is empty (no audience restriction).
    const scopeStrResult = safeJsonStringify(scope,);
    let audienceScopeStr: string | null = null;
    if (scopeStrResult.ok && (scope.subject || scope.requires_presence !== undefined)) {
      audienceScopeStr = scopeStrResult.value;
    }

    const keysStrResult = safeJsonStringify(entry.keys ?? [],);
    const keysStr = keysStrResult.ok ? keysStrResult.value : "[]";

    // N6: force selective=0 when keys are empty — selective gating requires
    // keyword triggers to ever match.
    const hasKeys = entry.keys && entry.keys.length > 0;
    const selectiveFlag = entry.selective && hasKeys ? 1 : 0;

    const loreValues = {
      name: entry.name,
      content: entry.content,
      keys: keysStr,
      constant: entry.constant ? 1 : 0,
      selective: selectiveFlag,
      position: entry.position ?? LorePosition.BeforeChar,
      insertion_order: entry.insertion_order ?? 0,
      priority: entry.priority ?? 0,
      cooldown_seconds: entry.cooldown_seconds ?? 0,
      enabled: LoreEntryStatus.Enabled,
      sort_order: 0,
      audience_scope: audienceScopeStr,
      created_at: now,
      updated_at: now,
      secondary_keys: null,
      case_sensitive: 0,
      comment: null,
      last_activated: null,
      key_type: null,
      key_groups: null,
      scan_depth: null,
      activation_chance: null,
    };

    if (target.table === "world_lore_entries") {
      await db
        .insertInto("world_lore_entries",)
        .values({
          ...loreValues,
          world_id: worldId!,
        },)
        .execute();
    } else {
      // actor_lore_entries
      await db
        .insertInto("actor_lore_entries",)
        .values({
          ...loreValues,
          actor_id: entityId,
          world_id: worldId && worldId !== "default" ? worldId : null,
        },)
        .execute();
    }
  }
}