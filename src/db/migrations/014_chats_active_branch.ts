// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 014_chats_active_branch
 *
 * Adds `chats.active_branch_id` (nullable FK -> chat_branches.id) so each
 * chat can remember which branch is currently displayed. Nullable: pre-
 * branching chats have no active_branch_id and read the full message chain.
 * Single ADD COLUMN per alterTable statement (SQLite limitation).
 */
import { type Kysely, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("chats",)
    .addColumn("active_branch_id", "text", (col,) => col.references("chat_branches.id",).onDelete("set null",),)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.alterTable("chats",).dropColumn("active_branch_id",).execute();
}
