// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Blog — final-form schema (Blog system).
 */
import { type Kysely, sql, } from "kysely";

/**
 * @param database
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("blog_comments",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("post_id", "text", (col,) => col.notNull().references("blog_posts.id",).onDelete("cascade",),)
    .addColumn("author_id", "text", (col,) => col.notNull(),)
    .addColumn("body", "text", (col,) => col.notNull(),)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("visible",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`,),)
    .addColumn("parent_comment_id", "text", (col,) => col.references("blog_comments.id",).onDelete("cascade",),)
    .execute();

  await database.schema
    .createTable("blog_follows",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("follower_id", "text", (col,) => col.notNull(),)
    .addColumn("author_id", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`,),)
    .execute();

  await database.schema
    .createTable("blog_posts",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("author_id", "text", (col,) => col.notNull(),)
    .addColumn("title", "text", (col,) => col.notNull(),)
    .addColumn("body", "text", (col,) => col.notNull(),)
    .addColumn("visibility", "text", (col,) => col.notNull().defaultTo("public",),)
    .addColumn("author_type", "text", (col,) => col.notNull().defaultTo("human",),)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("draft",),)
    .addColumn("category", "text",)
    .addColumn("world_id", "text",)
    .addColumn("character_id", "text",)
    .addColumn("scheduled_at", "text",)
    .addColumn("published_at", "text",)
    .addColumn("view_count", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("metadata", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`,),)
    .execute();

  await database.schema
    .createTable("blog_rag_sources",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("post_id", "text", (col,) => col.notNull().references("blog_posts.id",).onDelete("cascade",),)
    .addColumn("source_type", "text", (col,) => col.notNull(),)
    .addColumn("uri", "text", (col,) => col.notNull(),)
    .addColumn("title", "text", (col,) => col.notNull(),)
    .addColumn("relevance_score", "real", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("snippet", "text", (col,) => col.notNull().defaultTo("",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`,),)
    .execute();

  await database.schema
    .createTable("blog_tags",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("post_id", "text", (col,) => col.notNull().references("blog_posts.id",).onDelete("cascade",),)
    .addColumn("tag", "text", (col,) => col.notNull(),)
    .execute();

  await database.schema
    .createIndex("blog_comments_parent_idx",)
    .on("blog_comments",)
    .column("parent_comment_id",)
    .execute();

  await database.schema
    .createIndex("blog_follows_unique",)
    .on("blog_follows",)
    .columns(["follower_id", "author_id",],)
    .unique()
    .execute();

  await database.schema
    .createIndex("blog_rag_sources_post_idx",)
    .on("blog_rag_sources",)
    .column("post_id",)
    .execute();

  await database.schema
    .createIndex("blog_tags_post_idx",)
    .on("blog_tags",)
    .column("post_id",)
    .execute();

  await database.schema
    .createIndex("idx_blog_posts_author",)
    .on("blog_posts",)
    .column("author_id",)
    .execute();
}
/**
 * @param database
 */
export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("blog_tags",).execute();
  await database.schema.dropTable("blog_rag_sources",).execute();
  await database.schema.dropTable("blog_follows",).execute();
  await database.schema.dropTable("blog_comments",).execute();
  await database.schema.dropTable("blog_posts",).execute();
}
