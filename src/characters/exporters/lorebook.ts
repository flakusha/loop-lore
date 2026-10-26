// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
//
// src/characters/exporters/lorebook.ts
//
// Actor lorebook export: rebuild `LorebookData` from `actor_lore_entries`.
//
// The character-card import epilogue (`src/routes/import/lorebook.ts`) writes a
// card's `character_book` into `actor_lore_entries`, but nothing mapped those
// rows back, so every character export (single-actor and bulk ZIP) emitted a
// card with no `character_book` and a community share round-trip lost the whole
// lorebook. This module is the inverse of `importLorebook`.

import type { Kysely, } from "kysely";
import { LoreEntryStatus, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { jsonParseOr, } from "../../utils";
import type { LorebookData, LorebookEntry, } from "../spec";

/** One `actor_lore_entries` row as selected for export. */
type ActorLoreRow = {
  actor_id: string;
  name: string | null;
  content: string;
  keys: string;
  secondary_keys: string | null;
  selective: number;
  case_sensitive: number;
  enabled: string;
  constant: number;
  position: string;
  insertion_order: number;
  priority: number;
  comment: string | null;
  sort_order: number;
  key_type: string | null;
  key_groups: string | null;
  scan_depth: number | null;
  activation_chance: number | null;
};

/**
 * Map one lore row to a card lorebook entry.
 *
 * Integer flags are stored as 0/1 (`importLorebook` writes them that way) and
 * `id` is derived from `sort_order`, which is the only stable ordering the
 * table keeps. `secondary_keys` folds into `key_groups` (the AND/OR shape the
 * card spec uses) when no explicit groups are stored.
 * @param row - Raw `actor_lore_entries` row
 * @returns Card lorebook entry
 */
function mapLoreRow(row: ActorLoreRow,): LorebookEntry {
  const secondaryKeys = jsonParseOr<string[]>(row.secondary_keys ?? "[]", [],);
  const storedGroups = jsonParseOr<string[][]>(row.key_groups ?? "[]", [],);
  const keyGroups = storedGroups.length > 0
    ? storedGroups
    : secondaryKeys.length > 0
    ? [secondaryKeys,]
    : undefined;

  return {
    keys: jsonParseOr<string[]>(row.keys, [],),
    content: row.content,
    enabled: row.enabled === LoreEntryStatus.Enabled,
    insertion_order: row.insertion_order,
    case_sensitive: row.case_sensitive === 1,
    name: row.name ?? "",
    priority: row.priority,
    id: row.sort_order,
    comment: row.comment ?? undefined,
    selective: row.selective === 1,
    constant: row.constant === 1,
    position: row.position === "after_char" ? "after_char" : "before_char",
    use_regex: row.key_type === "regex",
    key_type: row.key_type === "regex" ? "regex" : "keyword",
    key_groups: keyGroups,
    scan_depth: row.scan_depth ?? undefined,
    activation_chance: row.activation_chance ?? undefined,
  };
}

/**
 * Rebuild the lorebooks of several actors in one query (bulk ZIP export).
 * @param db - Database instance
 * @param actorIds - Character actor ids
 * @returns Lorebooks keyed by actor id; actors without lore entries are absent
 */
export async function exportActorLorebooks(
  db: Kysely<DB>,
  actorIds: string[],
): Promise<Map<string, LorebookData>> {
  const lorebooks = new Map<string, LorebookData>();
  if (actorIds.length === 0) { return lorebooks; }

  const rows = await db
    .selectFrom("actor_lore_entries",)
    .select([
      "actor_id",
      "name",
      "content",
      "keys",
      "secondary_keys",
      "selective",
      "case_sensitive",
      "enabled",
      "constant",
      "position",
      "insertion_order",
      "priority",
      "comment",
      "sort_order",
      "key_type",
      "key_groups",
      "scan_depth",
      "activation_chance",
    ],)
    .where("actor_id", "in", actorIds,)
    .orderBy("sort_order", "asc",)
    .execute();

  for (const row of rows) {
    const existing = lorebooks.get(row.actor_id,);
    const entry = mapLoreRow(row,);
    if (existing) { existing.entries.push(entry,); }
    else { lorebooks.set(row.actor_id, { entries: [entry,], },); }
  }

  return lorebooks;
}

/**
 * Rebuild an actor's lorebook from its stored lore entries.
 * @param db - Database instance
 * @param actorId - Character actor id
 * @returns Lorebook data, or undefined when the actor has no lore entries
 */
export async function exportActorLorebook(
  db: Kysely<DB>,
  actorId: string,
): Promise<LorebookData | undefined> {
  const lorebooks = await exportActorLorebooks(db, [actorId,],);
  return lorebooks.get(actorId,);
}
