// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Rotation history (AC7 of TASK-chat-feature-encryption-key-rotation).
 *
 * rotation_history - append-only audit log of every chat-key rotation
 * event for a chat. One row per `rotateKeyOnLeave` /
 * `distributeKeysOnJoin`-triggered rotation. Persisted across process
 * restarts; queried for audit + debugging.
 *
 * `reason` column captures WHY a rotation happened ('leave', 'join',
 * 'scheduled', 'manual'). `actor_id` is the actor whose action triggered
 * the rotation (leaver, joiner, null for non-actor triggers).
 *
 * `old_key_id` / `new_key_id` reference `chat_keys.id` for audit.
 */
import type { Kysely, } from "kysely";
import { sql, } from "kysely";
import { recordSchemaVersion, } from "../schema-version";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("rotation_history",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",).onDelete("cascade",),)
    .addColumn("actor_id", "text", (col,) => col.references("actors.id",).onDelete("set null",),)
    .addColumn("reason", "text", (col,) => col.notNull(),)
    .addColumn("old_key_id", "text", (col,) => col.references("chat_keys.id",).onDelete("set null",),)
    .addColumn("new_key_id", "text", (col,) => col.notNull().references("chat_keys.id",).onDelete("restrict",),)
    .addColumn("messages_re_encrypted", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();
  await database.schema
    .createIndex("rotation_history_chat_id_created_at_idx",)
    .on("rotation_history",)
    .columns(["chat_id", "created_at",],)
    .execute();
  await recordSchemaVersion(database, 23, "rotation history (audit log for chat-key rotations)",);
}

/**
 * @param database
 */
export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("rotation_history",).execute();
}
