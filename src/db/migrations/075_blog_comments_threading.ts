// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Blog Comments Threading — add parent_comment_id self-FK.
 *
 * Enables nested / threaded comment replies on blog posts.
 * The column is nullable: top-level comments have no parent.
 */
import type { Kysely, } from "kysely";

/**
 * @param db
 */
export async function up(db: Kysely<unknown>,): Promise<void> {
  await db.schema
    .alterTable("blog_comments",)
    .addColumn("parent_comment_id", "text", (col,) => col.references("blog_comments.id",).onDelete("cascade",),)
    .execute();

  await db.schema
    .createIndex("blog_comments_parent_idx",)
    .on("blog_comments",)
    .column("parent_comment_id",)
    .execute();
}

/**
 * @param db
 */
export async function down(db: Kysely<unknown>,): Promise<void> {
  await db.schema
    .dropIndex("blog_comments_parent_idx",)
    .execute();

  await db.schema
    .alterTable("blog_comments",)
    .dropColumn("parent_comment_id",)
    .execute();
}
