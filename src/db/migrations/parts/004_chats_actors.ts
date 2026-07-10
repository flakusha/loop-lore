import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
  // ── Chats ───────────────────────────────────────────────────
  await database.schema
    .createTable("chats")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("type", "text", (col) => col.notNull().defaultTo("direct"))
    .addColumn("mode", "text", (col) => col.notNull().defaultTo("direct"))
    .addColumn("created_by", "text", (col) => col.notNull().references("users.id"))
    .addColumn("world_id", "text", (col) => col.references("worlds.id"))
    .addColumn("current_location_id", "text", (col) => col.references("locations.id"))
    .addColumn("story_state", "text")
    .addColumn("gm_config", "text")
    .addColumn("turn_strategy", "text")
    .addColumn("max_turns", "integer")
    .addColumn("auto_advance", "integer")
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .addColumn("updated_at", "text", (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .execute();

  await database.schema.createIndex("idx_chats_created_by").on("chats").column("created_by").execute();
  await database.schema.createIndex("idx_chats_world").on("chats").column("world_id").execute();
  await database.schema.createIndex("idx_chats_location").on("chats").column("current_location_id").execute();

  // ── Actors (unified participant table) ─────────────────────
  await database.schema
    .createTable("actors")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("actor_type", "text", (col) => col.notNull().defaultTo("user"))
    .addColumn("display_name", "text", (col) => col.notNull())
    .addColumn("user_id", "text", (col) => col.references("users.id"))
    .addColumn("owner_id", "text", (col) => col.references("users.id"))
    .addColumn("avatar_asset_id", "text", (col) => col.references("assets.id"))
    .addColumn("description", "text")
    .addColumn("system_prompt", "text")
    .addColumn("agent_type", "text", (col) => col.notNull().defaultTo("none"))
    .addColumn("settings", "text", (col) => col.notNull().defaultTo("{}"))
    .addColumn("data_version", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("visibility", "text", (col) => col.notNull().defaultTo("'private'"))
    .addColumn("welcome_message", "text")
    .addColumn("personality", "text")
    .addColumn("scenario", "text")
    .addColumn("mes_example", "text")
    .addColumn("alternate_greetings", "text")
    .addColumn("post_history_instructions", "text")
    .addColumn("creator_notes", "text")
    .addColumn("creator", "text")
    .addColumn("character_version", "text")
    .addColumn("import_spec", "text", (col) => col.notNull().defaultTo("raw"))
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .addColumn("updated_at", "text", (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .execute();

  await database.schema.createIndex("idx_actors_user_id").on("actors").column("user_id").execute();
  await database.schema.createIndex("idx_actors_owner").on("actors").column("owner_id").execute();
  await database.schema.createIndex("idx_actors_type").on("actors").column("actor_type").execute();

  // ── Chat Participants ──
  await database.schema
    .createTable("chat_participants")
    .addColumn("chat_id", "text", (col) => col.notNull().references("chats.id"))
    .addColumn("actor_id", "text", (col) => col.notNull().references("actors.id"))
    .addColumn("role_in_chat", "text", (col) => col.notNull().defaultTo("member"))
    .addColumn("joined_at", "text", (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .addColumn("last_read_message_id", "text")
    .addPrimaryKeyConstraint("pk_chat_participants", ["chat_id", "actor_id"])
    .execute();

  await database.schema.createIndex("idx_chat_participants_actor").on("chat_participants").column("actor_id").execute();

  // ── Characters (legacy) ────────────────────────────────────
  await database.schema
    .createTable("characters")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("owner_id", "text", (col) => col.notNull().references("users.id"))
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("avatar_asset_id", "text", (col) => col.references("assets.id"))
    .addColumn("description", "text")
    .addColumn("system_prompt", "text")
    .addColumn("agent_type", "text", (col) => col.notNull().defaultTo("none"))
    .addColumn("settings", "text", (col) => col.notNull().defaultTo("{}"))
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .addColumn("updated_at", "text", (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .execute();

  await database.schema.createIndex("idx_characters_owner").on("characters").column("owner_id").execute();

  // ── World Items (items placed in locations / carried by NPCs) ─
  await database.schema
    .createTable("world_items")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("world_id", "text", (col) => col.notNull().references("worlds.id"))
    .addColumn("item_id", "text", (col) => col.notNull().references("items.id"))
    .addColumn("location_id", "text", (col) => col.references("locations.id"))
    .addColumn("owner_actor_id", "text", (col) => col.references("actors.id"))
    .addColumn("quantity", "integer", (col) => col.notNull().defaultTo(1))
    .addColumn("visibility", "text", (col) => col.notNull().defaultTo("visible"))
    .addColumn("spawn_condition", "text")
    .addColumn("respawnable", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .addColumn("updated_at", "text", (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .execute();

  await database.schema.createIndex("idx_world_items_world").on("world_items").column("world_id").execute();
  await database.schema.createIndex("idx_world_items_location").on("world_items").column("location_id").execute();
  await database.schema.createIndex("idx_world_items_owner").on("world_items").column("owner_actor_id").execute();
  await database.schema.createIndex("idx_world_items_item").on("world_items").column("item_id").execute();
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await database.schema.dropTable("world_items").execute();
  await database.schema.dropTable("characters").execute();
  await database.schema.dropTable("chat_participants").execute();
  await database.schema.dropTable("actors").execute();
  await database.schema.dropTable("chats").execute();
}
