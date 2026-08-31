// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { LorebookData, } from "../../characters/spec";
import { LoreEntryStatus, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { safeJsonStringify, uid, } from "../../utils";

/**
 * Import lorebook entries for a character.
 * Maps LorebookData from parsed character card to actor_lore_entries table.
 * @param database
 * @param actorId
 * @param lorebook
 * @param warnings
 */
export async function importLorebook(
  database: Kysely<DB>,
  actorId: string,
  lorebook: LorebookData,
  warnings: string[],
): Promise<number> {
  let imported = 0;

  for (const entry of lorebook.entries) {
    try {
      await database
        .insertInto("actor_lore_entries",)
        .values({
          id: uid(),
          actor_id: actorId,
          name: entry.name || null,
          content: entry.content,
          keys: (() => {
            const r = safeJsonStringify(entry.keys,);
            return r.ok ? r.value : "[]";
          })(),
          secondary_keys: "[]",
          selective: entry.selective ? 1 : 0,
          case_sensitive: entry.case_sensitive ? 1 : 0,
          enabled: entry.enabled ? LoreEntryStatus.Enabled : LoreEntryStatus.Disabled,
          constant: entry.constant ? 1 : 0,
          position: entry.position,
          insertion_order: entry.insertion_order,
          priority: entry.priority,
          comment: entry.comment ?? null,
          sort_order: entry.id ?? imported,
        },)
        .execute();
      imported++;
    } catch (error) {
      const entryName = entry.name ?? `#${entry.id}`;
      const errorMsg = error instanceof Error ? error.message : "unknown error";
      warnings.push(`Failed to import lore entry "${entryName}": ${errorMsg}`,);
    }
  }

  return imported;
}
