// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 099_lore_search_tokens (TASK-encrypted-lore-search-tokens)
 *
 * Blind search-token store for the lorebook domain, mirroring
 * `message_search_tokens` (001_init, `token` → `term` renamed in 057):
 * HMAC tokens derived with the entry owner's `users.encryption_secret` are
 * stored under that owner id (`scope`), so owner searches match without the
 * server ever seeing the words. Lore rows live in TWO tables and a SQLite
 * FK references a single table, so the store is split per domain —
 * `world_lore_search_tokens` (FK → `world_lore_entries`) and
 * `actor_lore_search_tokens` (FK → `actor_lore_entries`). Both carry hard
 * `ON DELETE CASCADE` FKs so entry deletion (world delete, character
 * delete, lorebook re-import) removes its tokens with no app-code cleanup.
 *
 * Domain separation is structural: the message token reader queries only
 * `message_search_tokens`, the lore readers only these two tables — a lore
 * token can never surface in message search and vice versa. Rows are
 * written by `indexWorldLoreSearchTokens` / `indexActorLoreSearchTokens` in
 * `src/search/lore-token-store.ts` when `ENABLE_TOKEN_INDEXING=1` (no-op by
 * default — zero behavior change until the flag is on).
 */
import { type Kysely, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("world_lore_search_tokens",)
    .addColumn("entry_id", "text", (col,) => col.notNull().references("world_lore_entries.id",).onDelete("cascade",),)
    .addColumn("term", "text", (col,) => col.notNull(),)
    .addColumn("scope", "text", (col,) => col.notNull(),)
    .addPrimaryKeyConstraint("pk_world_lore_search_tokens", ["entry_id", "term",],)
    .execute();

  await database.schema
    .createIndex("idx_world_lore_search_tokens_lookup",)
    .on("world_lore_search_tokens",)
    .columns(["scope", "term",],)
    .execute();

  await database.schema
    .createTable("actor_lore_search_tokens",)
    .addColumn("entry_id", "text", (col,) => col.notNull().references("actor_lore_entries.id",).onDelete("cascade",),)
    .addColumn("term", "text", (col,) => col.notNull(),)
    .addColumn("scope", "text", (col,) => col.notNull(),)
    .addPrimaryKeyConstraint("pk_actor_lore_search_tokens", ["entry_id", "term",],)
    .execute();

  await database.schema
    .createIndex("idx_actor_lore_search_tokens_lookup",)
    .on("actor_lore_search_tokens",)
    .columns(["scope", "term",],)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("actor_lore_search_tokens",).execute();
  await database.schema.dropTable("world_lore_search_tokens",).execute();
}
