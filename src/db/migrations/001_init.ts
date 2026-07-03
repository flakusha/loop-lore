import type { Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
  // ── Users ──────────────────────────────────────────────────
  await database.schema
    .createTable("users")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("username", "text", (col) => col.notNull().unique())
    .addColumn("display_name", "text", (col) => col.notNull())
    .addColumn("password_hash", "text")
    .addColumn("role", "text", (col) => col.notNull().defaultTo("user"))
    .addColumn("settings", "text", (col) => col.notNull().defaultTo("{}"))
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo("(datetime('now'))"))
    .addColumn("last_seen_at", "text")
    .execute();

  // ── Sessions ────────────────────────────────────────────────
  await database.schema
    .createTable("sessions")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("user_id", "text", (col) => col.notNull().references("users.id"))
    .addColumn("token_hash", "text", (col) => col.notNull())
    .addColumn("ip", "text")
    .addColumn("user_agent", "text")
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo("(datetime('now'))"))
    .addColumn("last_activity", "text", (col) => col.notNull().defaultTo("(datetime('now'))"))
    .addColumn("expires_at", "text", (col) => col.notNull())
    .execute();

  await database.schema.createIndex("idx_sessions_user_id").on("sessions").column("user_id").execute();
  await database.schema.createIndex("idx_sessions_token_hash").on("sessions").column("token_hash").execute();

  // ── Chats ───────────────────────────────────────────────────
  await database.schema
    .createTable("chats")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("type", "text", (col) => col.notNull().defaultTo("direct"))
    .addColumn("created_by", "text", (col) => col.notNull().references("users.id"))
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo("(datetime('now'))"))
    .addColumn("updated_at", "text", (col) => col.notNull().defaultTo("(datetime('now'))"))
    .execute();

  // ── Message encoding type ─────────────────────────────────
  // Shared enum used by messages.content_encoding
  // Values: 'identity' | 'gzip' | 'zstd' | 'brotli'

  // ── Actor type ─────────────────────────────────────────────
  // Shared enum used by actors.actor_type
  // Values: 'user' | 'character' | 'narrator' | 'system'

  // ── Actors (unified participant table) ─────────────────────
  // Replaces polymorphic user_id/character_id pattern on messages
  // and the (participant_type, participant_id) pattern on chat_participants
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
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo("(datetime('now'))"))
    .addColumn("updated_at", "text", (col) => col.notNull().defaultTo("(datetime('now'))"))
    .execute();

  await database.schema.createIndex("idx_actors_user_id").on("actors").column("user_id").execute();
  await database.schema.createIndex("idx_actors_owner").on("actors").column("owner_id").execute();
  await database.schema.createIndex("idx_actors_type").on("actors").column("actor_type").execute();

  // ── Chat Participants ─────────────────────────────────────
  // Links actors (users/characters/system) to chats
  // Uses actor_id FK referencing the unified actors table
  await database.schema
    .createTable("chat_participants")
    .addColumn("chat_id", "text", (col) => col.notNull().references("chats.id"))
    .addColumn("actor_id", "text", (col) => col.notNull().references("actors.id"))
    .addColumn("role_in_chat", "text", (col) => col.notNull().defaultTo("member"))
    .addColumn("joined_at", "text", (col) => col.notNull().defaultTo("(datetime('now'))"))
    .addPrimaryKeyConstraint("pk_chat_participants", ["chat_id", "actor_id"])
    .execute();

  await database.schema.createIndex("idx_chat_participants_actor").on("chat_participants").column("actor_id").execute();

  // ── Messages ──────────────────────────────────────────────
  await database.schema
    .createTable("messages")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("chat_id", "text", (col) => col.notNull().references("chats.id"))
    .addColumn("actor_id", "text", (col) => col.notNull().references("actors.id"))
    .addColumn("role", "text", (col) => col.notNull())
    .addColumn("content", "text", (col) => col.notNull())
    .addColumn("content_type", "text", (col) => col.notNull().defaultTo("text"))
    .addColumn("content_encoding", "text", (col) => col.notNull().defaultTo("identity"))
    .addColumn("model_id", "text")
    .addColumn("provider", "text")
    .addColumn("token_count_prompt", "integer")
    .addColumn("token_count_completion", "integer")
    .addColumn("token_count_total", "integer")
    .addColumn("token_cost", "real")
    .addColumn("generation_time_ms", "integer")
    .addColumn("tokens_per_second", "real")
    .addColumn("status", "text", (col) => col.notNull().defaultTo("sent"))
    .addColumn("visibility", "text", (col) => col.notNull().defaultTo("visible"))
    .addColumn("hidden_by", "text", (col) => col.references("actors.id"))
    .addColumn("hidden_reason", "text")
    .addColumn("idempotency_key", "text")
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo("(datetime('now'))"))
    .addColumn("edited_at", "text")
    .execute();

  await database.schema.createIndex("idx_messages_chat_created").on("messages").columns(["chat_id", "created_at"]).execute();
  await database.schema.createIndex("idx_messages_idempotency").on("messages").column("idempotency_key").execute();
  await database.schema.createIndex("idx_messages_actor").on("messages").column("actor_id").execute();

  // ── Characters (legacy, kept for data migration) ──────────
  // Actor entries with actor_type='character' replace this table
  // for all new development. This table remains for backward compat
  // until the character manager is fully migrated.
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
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo("(datetime('now'))"))
    .addColumn("updated_at", "text", (col) => col.notNull().defaultTo("(datetime('now'))"))
    .execute();

  await database.schema.createIndex("idx_characters_owner").on("characters").column("owner_id").execute();

  // ── Assets ─────────────────────────────────────────────────
  await database.schema
    .createTable("assets")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("owner_id", "text", (col) => col.notNull().references("users.id"))
    .addColumn("filename", "text", (col) => col.notNull())
    .addColumn("mime_type", "text", (col) => col.notNull())
    .addColumn("asset_type", "text", (col) => col.notNull())
    .addColumn("size_bytes", "integer", (col) => col.notNull())
    .addColumn("storage_path", "text", (col) => col.notNull())
    .addColumn("storage_backend", "text", (col) => col.notNull().defaultTo("local"))
    .addColumn("width", "integer")
    .addColumn("height", "integer")
    .addColumn("duration_secs", "real")
    .addColumn("alt_text", "text")
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo("(datetime('now'))"))
    .execute();

  await database.schema.createIndex("idx_assets_owner").on("assets").column("owner_id").execute();

  // ── Asset Links (polymorphic) ─────────────────────────────
  await database.schema
    .createTable("asset_links")
    .addColumn("asset_id", "text", (col) => col.notNull().references("assets.id"))
    .addColumn("entity_type", "text", (col) => col.notNull())
    .addColumn("entity_id", "text", (col) => col.notNull())
    .addColumn("label", "text")
    .addColumn("sort_order", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo("(datetime('now'))"))
    .addPrimaryKeyConstraint("pk_asset_links", ["asset_id", "entity_type", "entity_id"])
    .execute();

  await database.schema.createIndex("idx_asset_links_entity").on("asset_links").columns(["entity_type", "entity_id"]).execute();

  // ── Worlds ─────────────────────────────────────────────────
  await database.schema
    .createTable("worlds")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("owner_id", "text", (col) => col.notNull().references("users.id"))
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("description", "text")
    .addColumn("lore", "text")
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo("(datetime('now'))"))
    .addColumn("updated_at", "text", (col) => col.notNull().defaultTo("(datetime('now'))"))
    .execute();
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await database.schema.dropTable("worlds").execute();
  await database.schema.dropTable("asset_links").execute();
  await database.schema.dropTable("assets").execute();
  await database.schema.dropTable("characters").execute();
  await database.schema.dropTable("messages").execute();
  await database.schema.dropTable("chat_participants").execute();
  await database.schema.dropTable("actors").execute();
  await database.schema.dropTable("chats").execute();
  await database.schema.dropTable("sessions").execute();
  await database.schema.dropTable("users").execute();
}
