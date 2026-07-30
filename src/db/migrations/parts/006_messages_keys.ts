import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  // ── Messages ──────────────────────────────────────────────
  await database.schema
    .createTable("messages",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",),)
    .addColumn("parent_id", "text", (col,) => col.references("messages.id",),)
    .addColumn("role", "text", (col,) => col.notNull(),)
    .addColumn("content", "text", (col,) => col.notNull(),)
    .addColumn("key_id", "text", (col,) => col.references("actor_keys.id",),)
    .addColumn("content_format", "text", (col,) => col.notNull().defaultTo("markdown",),)
    .addColumn("content_type", "text", (col,) => col.notNull().defaultTo("text",),)
    .addColumn("content_encoding", "text", (col,) => col.notNull().defaultTo("identity",),)
    .addColumn("model_id", "text",)
    .addColumn("provider", "text",)
    .addColumn("token_count_prompt", "integer",)
    .addColumn("token_count_completion", "integer",)
    .addColumn("token_count_total", "integer",)
    .addColumn("token_cost", "real",)
    .addColumn("generation_time_ms", "integer",)
    .addColumn("tokens_per_second", "real",)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("sending",),)
    .addColumn("visibility", "text", (col,) => col.notNull().defaultTo("visible",),)
    .addColumn("hidden_by", "text", (col,) => col.references("actors.id",),)
    .addColumn("hidden_reason", "text",)
    .addColumn("idempotency_key", "text",)
    .addColumn("continuation_index", "integer",)
    .addColumn("swipe_index", "integer",)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("edited_at", "text",)
    .addColumn("attachments", "text", (col,) => col.defaultTo("[]",),)
    .execute();

  await database.schema.createIndex("idx_messages_chat_created",).on("messages",).columns(["chat_id", "created_at",],)
    .execute();
  await database.schema.createIndex("idx_messages_idempotency",).on("messages",).column("idempotency_key",).execute();
  await database.schema.createIndex("idx_messages_actor",).on("messages",).column("actor_id",).execute();
  await database.schema.createIndex("idx_messages_parent",).on("messages",).column("parent_id",).execute();
  await database.schema.createIndex("idx_messages_key_id",).on("messages",).column("key_id",).execute();
  await database.schema.createIndex("idx_messages_content_format",).on("messages",).column("content_format",).execute();
  await database.schema.createIndex("idx_messages_visibility",).on("messages",).column("visibility",).execute();
  await database.schema.createIndex("idx_messages_status",).on("messages",).column("status",).execute();

  // ── Actor Keys (encryption) ─────────────────────────────────
  await database.schema
    .createTable("actor_keys",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("key_type", "text", (col,) => col.notNull(),)
    .addColumn("encrypted_key", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("expires_at", "text",)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("active",),)
    .addColumn("public_key", "text",)
    .execute();

  await database.schema.createIndex("idx_actor_keys_actor_id",).on("actor_keys",).column("actor_id",).execute();
  await database.schema.createIndex("idx_actor_keys_status",).on("actor_keys",).column("status",).execute();

  // ── User API Keys (BYO) ──────────────────────────────────
  await database.schema
    .createTable("user_api_keys",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("user_id", "text", (col,) => col.notNull().references("users.id",),)
    .addColumn("provider_name", "text", (col,) => col.notNull(),)
    .addColumn("api_key_encrypted", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema.createIndex("idx_user_api_keys_user_provider",).on("user_api_keys",).columns([
    "user_id",
    "provider_name",
  ],).execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("user_api_keys",).execute();
  await database.schema.dropTable("actor_keys",).execute();
  await database.schema.dropTable("messages",).execute();
}
