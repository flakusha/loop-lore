// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Migration 066 — Moderation actions soft-delete columns
 *
 * Adds `deleted_at` and `deleted_by` columns to `moderation_actions`
 * so the GDPR delete-user-data path preserves the audit log instead of
 * hard-deleting every moderation record keyed by a target user
 * (BUG-nsfw-moderation-delete-destroys-audit-log).
 *
 * Reads of the audit log now filter out rows where `deleted_at IS NOT NULL`
 * so the public surface is unchanged; the underlying rows survive for
 * forensic and regulatory purposes.
 */
import type { Kysely, } from "kysely";

export async function up(db: Kysely<unknown>,): Promise<void> {
  await db.schema
    .alterTable("moderation_actions",)
    .addColumn("deleted_at", "text",)
    .execute();

  await db.schema
    .alterTable("moderation_actions",)
    .addColumn("deleted_by", "text",)
    .execute();

  await db.schema
    .createIndex("mod_actions_deleted_at_idx",)
    .on("moderation_actions",)
    .column("deleted_at",)
    .execute();
}

export async function down(db: Kysely<unknown>,): Promise<void> {
  await db.schema.dropIndex("mod_actions_deleted_at_idx",).execute();
  await db.schema.alterTable("moderation_actions",).dropColumn("deleted_by",).execute();
  await db.schema.alterTable("moderation_actions",).dropColumn("deleted_at",).execute();
}
