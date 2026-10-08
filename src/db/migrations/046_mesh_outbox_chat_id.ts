// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 046_mesh_outbox_chat_id
 *
 * Add nullable `chat_id` to mesh_outbox so the drain pass can re-run the
 * per-chat content-clearance gate (authorizeChatExport) before re-pushing a
 * stored envelope. Without this, consent revoked after a failed push still
 * delivers for the entire backoff window (~2.1h across 8 attempts).
 *
 * Append-only: 038_mesh_outbox is untouched.
 */
import { type Kysely, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("mesh_outbox",)
    .addColumn("chat_id", "text",)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("mesh_outbox",)
    .dropColumn("chat_id",)
    .execute();
}
