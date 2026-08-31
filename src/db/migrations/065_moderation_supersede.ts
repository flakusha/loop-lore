// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Migration 065 — Moderation action supersede marker + soft-delete
 *
 * Adds `superseded_by TEXT`, `deleted_at TEXT`, and `deleted_by TEXT`
 * to `moderation_actions`. The supersede marker links an original action
 * to the reversal action recorded when an appeal is approved. The
 * soft-delete columns support GDPR erasure without destroying the audit
 * trail (sibling ticket BUG-nsfw-moderation-delete-destroys-audit-log).
 *
 * BUG-nsfw-reviewappeal-auto-reverses-actions: required so the approval
 * branch can write `superseded_by = <reversal_id>` on the original
 * action without losing it from the audit log.
 *
 * Note: SQLite `ALTER TABLE` accepts one `ADD COLUMN` per statement.
 */
import { type Kysely, } from "kysely";

/**
 * @param db
 */
export async function up(db: Kysely<unknown>,): Promise<void> {
  await db.schema
    .alterTable("moderation_actions",)
    .addColumn("superseded_by", "text",)
    .execute();
  await db.schema
    .alterTable("moderation_actions",)
    .addColumn("deleted_at", "text",)
    .execute();
  await db.schema
    .alterTable("moderation_actions",)
    .addColumn("deleted_by", "text",)
    .execute();

  await db.schema
    .createIndex("mod_actions_superseded_idx",)
    .on("moderation_actions",)
    .column("superseded_by",)
    .execute();

  await db.schema
    .createIndex("mod_actions_deleted_at_idx",)
    .on("moderation_actions",)
    .column("deleted_at",)
    .execute();
}

/**
 * @param db
 */
export async function down(db: Kysely<unknown>,): Promise<void> {
  await db.schema.dropIndex("mod_actions_deleted_at_idx",).execute();
  await db.schema.dropIndex("mod_actions_superseded_idx",).execute();
  await db.schema.alterTable("moderation_actions",).dropColumn("deleted_by",).execute();
  await db.schema.alterTable("moderation_actions",).dropColumn("deleted_at",).execute();
  await db.schema.alterTable("moderation_actions",).dropColumn("superseded_by",).execute();
}
