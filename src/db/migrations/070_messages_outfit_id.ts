// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 070_messages_outfit_id
 *
 * Add outfit_id column to messages table. Nullable: null = no outfit worn
 * at message time (Phase 1 writes null; Phase 2 hook fills it).
 */
import { type Kysely, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("messages",)
    .addColumn("outfit_id", "text",)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.alterTable("messages",).dropColumn("outfit_id",).execute();
}
