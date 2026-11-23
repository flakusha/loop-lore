// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 012_content_blog — final-form consolidated baseline (S2).
 * Inline Kysely DSL only: the textual migration parser requires literal
 * createTable/addColumn calls inside up(). Raw SQL carries indexes,
 * triggers, FTS virtual tables and the remaining DML oracles.
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("shadow_notes",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",).onDelete("cascade",),)
    .addColumn("type", "text", (col,) => col.notNull(),)
    .addColumn("content", "text", (col,) => col.notNull(),)
    .addColumn("status", "text", (col,) => col.defaultTo("hidden",).notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("visibility", "text", (col,) => col.defaultTo("user_visible",).notNull(),)
    .addColumn("expires_at", "text",)
    .addColumn("author_type", "text", (col,) => col.defaultTo("user",).notNull(),)
    .addColumn("content_version", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("record_hash", "text", (col,) => col.defaultTo("",).notNull(),)
    .addColumn("trigger_condition", "text",)
    .addColumn("revealed_to", "text",)
    .execute();

  await database.schema
    .createTable("whitenotes",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",).onDelete("cascade",),)
    .addColumn("type", "text", (col,) => col.notNull(),)
    .addColumn("content", "text", (col,) => col.notNull(),)
    .addColumn("priority", "integer", (col,) => col.defaultTo(5,).notNull(),)
    .addColumn("scope", "text", (col,) => col.defaultTo("scene",).notNull(),)
    .addColumn("expires_at", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("content_version", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("record_hash", "text", (col,) => col.defaultTo("",).notNull(),)
    .addColumn("message_id", "text", (col,) => col.references("messages.id",),)
    .execute();

  await database.schema
    .createTable("blog_comments",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("post_id", "text", (col,) => col.notNull().references("blog_posts.id",).onDelete("cascade",),)
    .addColumn("author_id", "text", (col,) => col.notNull(),)
    .addColumn("body", "text", (col,) => col.notNull(),)
    .addColumn("status", "text", (col,) => col.defaultTo("visible",).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`CURRENT_TIMESTAMP`,).notNull(),)
    .addColumn("parent_comment_id", "text", (col,) => col.references("blog_comments.id",).onDelete("cascade",),)
    .execute();

  await database.schema
    .createTable("blog_follows",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("follower_id", "text", (col,) => col.notNull(),)
    .addColumn("author_id", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`CURRENT_TIMESTAMP`,).notNull(),)
    .execute();

  await database.schema
    .createTable("blog_posts",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("author_id", "text", (col,) => col.notNull(),)
    .addColumn("title", "text", (col,) => col.notNull(),)
    .addColumn("body", "text", (col,) => col.notNull(),)
    .addColumn("visibility", "text", (col,) => col.defaultTo("public",).notNull(),)
    .addColumn("author_type", "text", (col,) => col.defaultTo("human",).notNull(),)
    .addColumn("status", "text", (col,) => col.defaultTo("draft",).notNull(),)
    .addColumn("category", "text",)
    .addColumn("world_id", "text",)
    .addColumn("character_id", "text",)
    .addColumn("scheduled_at", "text",)
    .addColumn("published_at", "text",)
    .addColumn("view_count", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("metadata", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`CURRENT_TIMESTAMP`,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`CURRENT_TIMESTAMP`,).notNull(),)
    .addColumn("content_version", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("record_hash", "text", (col,) => col.defaultTo("",).notNull(),)
    .execute();

  await database.schema
    .createTable("blog_rag_sources",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("post_id", "text", (col,) => col.notNull().references("blog_posts.id",).onDelete("cascade",),)
    .addColumn("source_type", "text", (col,) => col.notNull(),)
    .addColumn("uri", "text", (col,) => col.notNull(),)
    .addColumn("title", "text", (col,) => col.notNull(),)
    .addColumn("relevance_score", "real", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("snippet", "text", (col,) => col.defaultTo("",).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`CURRENT_TIMESTAMP`,).notNull(),)
    .execute();

  await database.schema
    .createTable("blog_tags",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("post_id", "text", (col,) => col.notNull().references("blog_posts.id",).onDelete("cascade",),)
    .addColumn("tag", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text",)
    .addColumn("updated_at", "text",)
    .execute();

  // raw index: blog_comments_parent_idx
  await sql`CREATE INDEX "blog_comments_parent_idx" on "blog_comments" ("parent_comment_id")`.execute(database,);
  // raw index: blog_follows_unique
  await sql`CREATE UNIQUE INDEX "blog_follows_unique" on "blog_follows" ("follower_id", "author_id")`.execute(
    database,
  );

  // raw index: blog_rag_sources_post_idx
  await sql`CREATE INDEX "blog_rag_sources_post_idx" on "blog_rag_sources" ("post_id")`.execute(database,);
  // raw index: blog_tags_post_idx
  await sql`CREATE INDEX "blog_tags_post_idx" on "blog_tags" ("post_id")`.execute(database,);
  // raw index: idx_blog_comments_post_created
  await sql`CREATE INDEX "idx_blog_comments_post_created" on "blog_comments" ("post_id", "created_at")`.execute(
    database,
  );

  // raw index: idx_blog_posts_author
  await sql`CREATE INDEX "idx_blog_posts_author" on "blog_posts" ("author_id")`.execute(database,);
  // raw index: idx_blog_posts_author_published
  await sql`CREATE INDEX "idx_blog_posts_author_published" on "blog_posts" ("author_id", "published_at")`.execute(
    database,
  );

  // raw index: idx_shadow_notes_chat_author_type
  await sql`CREATE INDEX idx_shadow_notes_chat_author_type
      ON shadow_notes (chat_id, author_type)
    `.execute(database,);

  // raw index: idx_shadow_notes_chat_id
  await sql`CREATE INDEX "idx_shadow_notes_chat_id" on "shadow_notes" ("chat_id")`.execute(database,);
  // raw index: idx_shadow_notes_chat_status
  await sql`CREATE INDEX "idx_shadow_notes_chat_status" on "shadow_notes" ("chat_id", "status")`.execute(database,);
  // raw index: idx_shadow_notes_chat_visibility
  await sql`CREATE INDEX idx_shadow_notes_chat_visibility
      ON shadow_notes (chat_id, visibility)
    `.execute(database,);

  // raw index: idx_shadow_notes_expires
  await sql`CREATE INDEX "idx_shadow_notes_expires" on "shadow_notes" ("expires_at")`.execute(database,);
  // raw index: idx_shadow_notes_expires_at
  await sql`CREATE INDEX idx_shadow_notes_expires_at
      ON shadow_notes (expires_at)
      WHERE expires_at IS NOT NULL
    `.execute(database,);

  // raw index: idx_whitenotes_chat_id
  await sql`CREATE INDEX "idx_whitenotes_chat_id" on "whitenotes" ("chat_id")`.execute(database,);
  // raw index: idx_whitenotes_expires
  await sql`CREATE INDEX "idx_whitenotes_expires" on "whitenotes" ("expires_at")`.execute(database,);
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("blog_comments",).execute();
  await database.schema.dropTable("blog_rag_sources",).execute();
  await database.schema.dropTable("blog_tags",).execute();
  await database.schema.dropTable("blog_follows",).execute();
  await database.schema.dropTable("blog_posts",).execute();
  await database.schema.dropTable("whitenotes",).execute();
  await database.schema.dropTable("shadow_notes",).execute();
}
