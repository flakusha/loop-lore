// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 094_lorebook_inclusion_groups
 *
 * Lorebook inclusion groups (epic-lorebook-inclusion-groups): one nullable
 * `inclusion_group` column on both lore tables (`world_lore_entries`,
 * `actor_lore_entries`).
 *
 * - `inclusion_group` (text NULL): entries sharing a non-null group are
 *   mutually exclusive — at most one of them fires per prompt turn. The
 *   winner is the entry that matched the most keys, then the highest
 *   priority, then the lowest `insertion_order` (see
 *   `src/assistant/prompt/sections/lore-activation.ts`).
 *
 * NULL (the default for every pre-existing row) means "no group" and keeps
 * today's behavior exactly: entries are admitted independently of each
 * other. A blank string is treated as no group as well (the value is
 * normalized at parse time).
 */
import { type Kysely, } from "kysely";

/** Add the inclusion_group column to both lore tables. */
export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("world_lore_entries",)
    .addColumn("inclusion_group", "text",)
    .execute();

  await database.schema
    .alterTable("actor_lore_entries",)
    .addColumn("inclusion_group", "text",)
    .execute();
}

/** Drop the inclusion_group column from both lore tables. */
export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("actor_lore_entries",)
    .dropColumn("inclusion_group",)
    .execute();

  await database.schema
    .alterTable("world_lore_entries",)
    .dropColumn("inclusion_group",)
    .execute();
}
