// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Music Links — oEmbed-backed music link messages — DB Schema
 *
 * Stores shared music links (Spotify, YouTube Music, SoundCloud, Apple Music,
 * Bandcamp) as standalone rows with oEmbed metadata. Not owned by messages in
 * Phase 1; a `message_id` FK can be added in Phase 2 to thread links to a
 * specific message.
 *
 * See .plan/tickets/TASK-chat-music-linking.md.
 */
import type { Kysely, } from "kysely";

export async function up(db: Kysely<unknown>,): Promise<void> {
  await db.schema
    .createTable("music_links",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.references("chats.id",).onDelete("cascade",).notNull(),)
    .addColumn("section_id", "text", (col,) => col.references("chat_sections.id",).onDelete("set null",),)
    .addColumn("sender_id", "text", (col,) => col.references("users.id",).onDelete("cascade",).notNull(),)
    .addColumn("service", "text", (col,) => col.notNull(),)
    .addColumn("url", "text", (col,) => col.notNull(),)
    .addColumn("embed_html", "text",)
    .addColumn("title", "text", (col,) => col.notNull(),)
    .addColumn("artist", "text", (col,) => col.notNull(),)
    .addColumn("thumbnail_url", "text",)
    .addColumn("duration_secs", "integer",)
    .addColumn("service_track_id", "text", (col,) => col.notNull(),)
    .addColumn("service_url", "text", (col,) => col.notNull(),)
    .addColumn("is_playlist", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("track_count", "integer",)
    .addColumn("explicit", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("year", "integer",)
    .addColumn("genre", "text",)
    .addColumn("nsfw_hidden", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(new Date().toISOString(),),)
    .execute();

  // Chronological link list per chat
  await db.schema
    .createIndex("music_links_chat_created_idx",)
    .on("music_links",)
    .columns(["chat_id", "created_at",],)
    .execute();

  // User's link history
  await db.schema
    .createIndex("music_links_sender_idx",)
    .on("music_links",)
    .columns(["sender_id",],)
    .execute();
}

export async function down(db: Kysely<unknown>,): Promise<void> {
  await db.schema.dropIndex("music_links_sender_idx",).execute();
  await db.schema.dropIndex("music_links_chat_created_idx",).execute();
  await db.schema.dropTable("music_links",).execute();
}
