/**
 * Blog System — DB Schema
 *
 * blog_posts, blog_comments, blog_tags, blog_follows, blog_rag_sources.
 * Blog records reuse chat-shaped content; this migration adds
 * the blog-specific metadata tables.
 */
import type { Kysely } from "kysely";
import { sql } from "kysely";

export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .createTable("blog_posts")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("author_id", "text", (col) => col.notNull())
    .addColumn("title", "text", (col) => col.notNull())
    .addColumn("body", "text", (col) => col.notNull())
    .addColumn("visibility", "text", (col) => col.notNull().defaultTo("public"))
    .addColumn("author_type", "text", (col) => col.notNull().defaultTo("human"))
    .addColumn("status", "text", (col) => col.notNull().defaultTo("draft"))
    .addColumn("category", "text")
    .addColumn("world_id", "text")
    .addColumn("character_id", "text")
    .addColumn("scheduled_at", "text")
    .addColumn("published_at", "text")
    .addColumn("view_count", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("metadata", "text", (col) => col.notNull().defaultTo("{}"))
    .addColumn("created_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .addColumn("updated_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .execute();

  await db.schema
    .createTable("blog_comments")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("post_id", "text", (col) =>
      col.notNull().references("blog_posts.id").onDelete("cascade")
    )
    .addColumn("author_id", "text", (col) => col.notNull())
    .addColumn("body", "text", (col) => col.notNull())
    .addColumn("status", "text", (col) => col.notNull().defaultTo("visible"))
    .addColumn("created_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .execute();

  await db.schema
    .createTable("blog_tags")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("post_id", "text", (col) =>
      col.notNull().references("blog_posts.id").onDelete("cascade")
    )
    .addColumn("tag", "text", (col) => col.notNull())
    .execute();

  await db.schema
    .createIndex("blog_tags_post_idx")
    .on("blog_tags")
    .column("post_id")
    .execute();

  await db.schema
    .createTable("blog_follows")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("follower_id", "text", (col) => col.notNull())
    .addColumn("author_id", "text", (col) => col.notNull())
    .addColumn("created_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .execute();

  await db.schema
    .createIndex("blog_follows_unique")
    .on("blog_follows")
    .columns(["follower_id", "author_id"])
    .unique()
    .execute();

  await db.schema
    .createTable("blog_rag_sources")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("post_id", "text", (col) =>
      col.notNull().references("blog_posts.id").onDelete("cascade")
    )
    .addColumn("source_type", "text", (col) => col.notNull())
    .addColumn("uri", "text", (col) => col.notNull())
    .addColumn("title", "text", (col) => col.notNull())
    .addColumn("relevance_score", "real", (col) => col.notNull().defaultTo(0))
    .addColumn("snippet", "text", (col) => col.notNull().defaultTo(""))
    .addColumn("created_at", "text", (col) =>
      col.notNull().defaultTo(sql`CURRENT_TIMESTAMP`)
    )
    .execute();

  await db.schema
    .createIndex("blog_rag_sources_post_idx")
    .on("blog_rag_sources")
    .column("post_id")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema.dropTable("blog_rag_sources").execute();
  await db.schema.dropTable("blog_follows").execute();
  await db.schema.dropTable("blog_tags").execute();
  await db.schema.dropTable("blog_comments").execute();
  await db.schema.dropTable("blog_posts").execute();
}
