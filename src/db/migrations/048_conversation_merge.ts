// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 048_conversation_merge
 *
 * Content-merge schema (FEA-2026-047): fuses two or more conversation
 * branches into ONE continuation. Distinct from the structural splice-merge
 * (FEAT-046, `src/chat/service/branch-merge.ts`), which re-parents a subtree
 * and DELETES the source branch.
 *
 * `messages.parent_id` stays single-parent; multi-parentage lives in the
 * `branch_merge_sources` join (N source tips -> one merge record), and the
 * result rows hang off the merge's `base_message_id` (the LCA) carrying
 * `messages.merge_id` as a badge/regeneration backref.
 *
 * Numbering: authored as 046, which dev had already spent on
 * 046_mesh_outbox_chat_id.ts (migrations.test.ts pins prefixes unique +
 * gapless, so the duplicate was a hard gate failure). Renumbered to 048
 * before ever landing: 047 is claimed by followup-timeline-scope
 * (047_chats_timeline_id.ts), so followup-timeline-scope MUST finalize first.
 * Never applied to any DB, so no kysely_migration row holds the old name.
 *
 * Enum CHECKs follow `ck_mesh_outbox_status` (038); single ADD COLUMN per
 * `alterTable` (SQLite limitation, 014 precedent). `down()` is loss-tolerant:
 * confirmed merges keep their message rows and synthetic `chat_branches`
 * rows as plain data — only provenance links and drafts are dropped.
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("branch_merges",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",).onDelete("cascade",),)
    .addColumn("base_message_id", "text", (col,) => col.notNull().references("messages.id",),)
    .addColumn("mode", "text", (col,) => col.notNull(),)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("draft",),)
    .addColumn("result_message_id", "text", (col,) => col.references("messages.id",).onDelete("set null",),)
    .addColumn("merged_branch_id", "text", (col,) => col.references("chat_branches.id",).onDelete("set null",),)
    .addColumn("created_by", "text", (col,) => col.notNull().references("users.id",),)
    .addColumn("idempotency_key", "text",)
    .addColumn("metadata", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("confirmed_at", "text",)
    .addCheckConstraint(
      "ck_branch_merges_mode",
      sql`mode IN ('combined','second-over-first','first-over-second','fresh-discovery','single-plus-glean')`,
    )
    .addCheckConstraint("ck_branch_merges_status", sql`status IN ('draft','confirmed','discarded')`,)
    .execute();

  await database.schema
    .createTable("branch_merge_sources",)
    .addColumn("merge_id", "text", (col,) => col.notNull().references("branch_merges.id",).onDelete("cascade",),)
    // 0 = first, 1 = second, ... — modes 2/3/5 are ordinal-sensitive.
    .addColumn("ordinal", "integer", (col,) => col.notNull(),)
    // Nullable: a bare swipe tip (a chosen sibling) has no chat_branches row.
    .addColumn("branch_id", "text", (col,) => col.references("chat_branches.id",).onDelete("set null",),)
    .addColumn("tip_message_id", "text", (col,) => col.notNull().references("messages.id",),)
    .addPrimaryKeyConstraint("pk_branch_merge_sources", ["merge_id", "ordinal",],)
    .execute();

  // One column per statement (SQLite).
  await database.schema
    .alterTable("messages",)
    .addColumn("merge_id", "text", (col,) => col.references("branch_merges.id",).onDelete("set null",),)
    .execute();

  await database.schema
    .createIndex("idx_branch_merges_chat",)
    .on("branch_merges",)
    .columns(["chat_id", "created_at",],)
    .execute();

  // Partial unique index: the installed Kysely `ref(col).isNotNull()` form is
  // unavailable, so the WHERE clause is a raw sql fragment.
  await database.schema
    .createIndex("uq_branch_merges_idem",)
    .on("branch_merges",)
    .columns(["chat_id", "idempotency_key",],)
    .unique()
    .where(sql<boolean>`idempotency_key IS NOT NULL`,)
    .execute();

  await database.schema
    .createIndex("uq_branch_merge_sources_tip",)
    .on("branch_merge_sources",)
    .columns(["merge_id", "tip_message_id",],)
    .unique()
    .execute();

  await database.schema
    .createIndex("idx_messages_merge",)
    .on("messages",)
    .column("merge_id",)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropIndex("idx_messages_merge",).execute();
  await database.schema.alterTable("messages",).dropColumn("merge_id",).execute();
  await database.schema.dropIndex("uq_branch_merge_sources_tip",).execute();
  await database.schema.dropIndex("uq_branch_merges_idem",).execute();
  await database.schema.dropIndex("idx_branch_merges_chat",).execute();
  await database.schema.dropTable("branch_merge_sources",).execute();
  await database.schema.dropTable("branch_merges",).execute();
}
