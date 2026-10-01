// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 028_wardrobe — wardrobe / appearance (avatar-variants) feature cluster.
 *
 * Adds the outfit axis to the (emotion × outfit) avatar variant key:
 *
 *   - `wardrobe_items` — outfit definitions (actor-personal or world
 *     template scope). `descriptor` is the prompt fragment composed into
 *     outfit-scoped generation; `tags` carries labels like formal/armor.
 *     Integrates with the pre-existing `actors.outfits` JSON seam: ids
 *     from that catalog are materialized here on first write (FK target
 *     for avatar/override rows).
 *   - `actor_wardrobe` — the actor's wardrobe bindings: which inventory
 *     item *instances* (`actor_items`) compose an outfit. Mirrors the
 *     `actor_items` per-actor instance pattern instead of a parallel
 *     item model (owner directive: outfit = coherent set of appearance
 *     items bound to inventory).
 *   - `chat_wardrobe_overrides` — chat/scene outfit override, the top
 *     rung of the context precedence ladder (chat > location > default).
 *   - `character_avatars.outfit_id` — nullable variant dimension;
 *     NULL keeps today's emotion-only behavior (zero-surprise).
 *   - `world_avatar_config.outfit_bindings` — location→outfit rule map
 *     as JSON, following the multi-avatar storage choice (JSON column
 *     on the existing world avatar config row).
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("wardrobe_items",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.references("actors.id",).onDelete("cascade",),)
    .addColumn("world_id", "text", (col,) => col.references("worlds.id",).onDelete("cascade",),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("descriptor", "text", (col,) => col.notNull().defaultTo("",),)
    .addColumn("tags", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("sort_order", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addCheckConstraint(
      "ck_wardrobe_items_scope",
      sql`actor_id IS NOT NULL OR world_id IS NOT NULL`,
    )
    .execute();

  await database.schema
    .createIndex("idx_wardrobe_items_actor",)
    .on("wardrobe_items",)
    .column("actor_id",)
    .execute();

  await database.schema
    .createIndex("idx_wardrobe_items_world",)
    .on("wardrobe_items",)
    .column("world_id",)
    .execute();

  // Outfit ↔ inventory item-instance bindings (the actor's wardrobe).
  // One row per bound instance; an outfit with no bound instances still
  // exists as a wardrobe_items row (descriptor-only outfit).
  await database.schema
    .createTable("actor_wardrobe",)
    .addColumn("id", "text", (col,) => col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`,),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn(
      "wardrobe_item_id",
      "text",
      (col,) => col.notNull().references("wardrobe_items.id",).onDelete("cascade",),
    )
    .addColumn("item_instance_id", "text", (col,) => col.references("actor_items.id",).onDelete("set null",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createIndex("idx_actor_wardrobe_actor_outfit",)
    .on("actor_wardrobe",)
    .columns(["actor_id", "wardrobe_item_id",],)
    .execute();

  // Chat/scene override: top rung of the outfit precedence ladder.
  await database.schema
    .createTable("chat_wardrobe_overrides",)
    .addColumn("id", "text", (col,) => col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`,),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",).onDelete("cascade",),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("outfit_id", "text", (col,) => col.notNull().references("wardrobe_items.id",).onDelete("cascade",),)
    .addColumn("changed_by", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addUniqueConstraint("uq_chat_wardrobe_override", ["chat_id", "actor_id",],)
    .execute();

  // Nullable: NULL = base/outfitless variant (today's behavior).
  await database.schema
    .alterTable("character_avatars",)
    .addColumn("outfit_id", "text", (col,) => col.references("wardrobe_items.id",).onDelete("set null",),)
    .execute();

  // Location→outfit rules as JSON on the world avatar config row — the
  // storage choice TASK-character-multi-avatar settled on.
  await database.schema
    .alterTable("world_avatar_config",)
    .addColumn("outfit_bindings", "text",)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("world_avatar_config",)
    .dropColumn("outfit_bindings",)
    .execute();

  await database.schema
    .alterTable("character_avatars",)
    .dropColumn("outfit_id",)
    .execute();

  await database.schema.dropTable("chat_wardrobe_overrides",).execute();
  await database.schema.dropTable("actor_wardrobe",).execute();
  await database.schema.dropTable("wardrobe_items",).execute();
}
