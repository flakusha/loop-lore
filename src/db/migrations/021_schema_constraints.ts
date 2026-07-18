/**
 * Migration 021 — CHECK constraints for key enum columns
 *
 * SQLite does not support ALTER TABLE ADD CONSTRAINT, so we
 * recreate four tables with embedded CHECK constraints:
 *
 * - `users.role`          — CHECK(role IN ('admin','user','viewer','solo'))
 * - `chats.type`          — CHECK(type IN ('direct','group'))
 * - `world_lore_entries.enabled` — CHECK(enabled IN ('enabled','disabled','archived'))
 * - `actor_lore_entries.enabled` — CHECK(enabled IN ('enabled','disabled','archived'))
 *
 * Messages.role is omitted: 20+ columns, self-referencing FK,
 * and 3+ child tables reusing the FK. Risk/reward unfavourable.
 *
 * Uses PRAGMA foreign_keys=OFF to bypass FK checks during
 * the DROP TABLE / RENAME cycle. FK integrity is preserved
 * because all data moves through INSERT ... SELECT.
 */
import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<any>): Promise<void> {
  await sql`PRAGMA foreign_keys = OFF`.execute(database);

  // ── users — CHECK(role) ─────────────────────────────────
  await database.schema
    .createTable("users_ck")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("username", "text", (col) => col.notNull().unique())
    .addColumn("display_name", "text", (col) => col.notNull())
    .addColumn("password_hash", "text")
    .addColumn("role", "text", (col) => col.notNull().defaultTo("user"))
    .addColumn("status", "text", (col) => col.notNull().defaultTo("active"))
    .addColumn("settings", "text", (col) => col.notNull().defaultTo("{}"))
    .addColumn("birth_date", "text")
    .addColumn("age_gate_accepted_at", "text")
    .addColumn("data_version", "integer", (col) => col.notNull().defaultTo(1))
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .addColumn("last_seen_at", "text")
    .addCheckConstraint(
      "ck_users_role",
      sql`role IN ('admin', 'user', 'viewer', 'solo')`,
    )
    .execute();

  await sql`INSERT INTO users_ck SELECT * FROM users`.execute(database);
  await database.schema.dropTable("users").execute();
  await database.schema.alterTable("users_ck").renameTo("users").execute();
  await database.schema.createIndex("idx_users_role").on("users").column("role").execute();

  // ── chats — CHECK(type) ─────────────────────────────────
  await database.schema
    .createTable("chats_ck")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("type", "text", (col) => col.notNull().defaultTo("direct"))
    .addColumn("mode", "text", (col) => col.notNull().defaultTo("direct"))
    .addColumn("purpose", "text", (col) => col.notNull().defaultTo("main"))
    .addColumn("created_by", "text", (col) => col.notNull())
    .addColumn("world_id", "text")
    .addColumn("current_location_id", "text")
    .addColumn("story_state", "text")
    .addColumn("gm_config", "text")
    .addColumn("turn_strategy", "text")
    .addColumn("max_turns", "integer")
    .addColumn("auto_advance", "integer")
    .addColumn("parent_chat_id", "text")
    .addColumn("is_pinned", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .addColumn("updated_at", "text", (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .addForeignKeyConstraint("fk_chats_created_by", ["created_by"], "users", ["id"])
    .addForeignKeyConstraint("fk_chats_world", ["world_id"], "worlds", ["id"])
    .addForeignKeyConstraint("fk_chats_location", ["current_location_id"], "locations", ["id"])
    .addCheckConstraint(
      "ck_chats_type",
      sql`type IN ('direct', 'group')`,
    )
    .execute();

  await sql`INSERT INTO chats_ck SELECT * FROM chats`.execute(database);
  await database.schema.dropTable("chats").execute();
  await database.schema.alterTable("chats_ck").renameTo("chats").execute();
  await database.schema.createIndex("idx_chats_created_by").on("chats").column("created_by").execute();
  await database.schema.createIndex("idx_chats_world").on("chats").column("world_id").execute();
  await database.schema.createIndex("idx_chats_location").on("chats").column("current_location_id").execute();
  await database.schema.createIndex("idx_chats_pinned").on("chats").column("is_pinned").execute();
  await database.schema.createIndex("idx_chats_parent").on("chats").column("parent_chat_id").execute();

  // ── world_lore_entries — CHECK(enabled) ──────────────────
  await database.schema
    .createTable("world_lore_entries_ck")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("world_id", "text", (col) => col.notNull())
    .addColumn("name", "text")
    .addColumn("content", "text", (col) => col.notNull())
    .addColumn("keys", "text", (col) => col.notNull().defaultTo("[]"))
    .addColumn("secondary_keys", "text", (col) => col.defaultTo("[]"))
    .addColumn("selective", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("case_sensitive", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("enabled", "text", (col) => col.notNull().defaultTo("enabled"))
    .addColumn("constant", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("position", "text", (col) => col.notNull().defaultTo("before_char"))
    .addColumn("insertion_order", "integer", (col) => col.notNull().defaultTo(100))
    .addColumn("priority", "integer", (col) => col.notNull().defaultTo(100))
    .addColumn("comment", "text")
    .addColumn("sort_order", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .addColumn("updated_at", "text", (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .addForeignKeyConstraint("fk_wle_world", ["world_id"], "worlds", ["id"])
    .addCheckConstraint(
      "ck_wle_enabled",
      sql`enabled IN ('enabled', 'disabled', 'archived')`,
    )
    .execute();

  await sql`INSERT INTO world_lore_entries_ck SELECT * FROM world_lore_entries`.execute(database);
  await database.schema.dropTable("world_lore_entries").execute();
  await database.schema.alterTable("world_lore_entries_ck").renameTo("world_lore_entries").execute();
  await database.schema.createIndex("idx_world_lore_world").on("world_lore_entries").column("world_id").execute();
  await database.schema.createIndex("idx_world_lore_position").on("world_lore_entries").column("position").execute();

  // ── actor_lore_entries — CHECK(enabled) ─────────────────
  await database.schema
    .createTable("actor_lore_entries_ck")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("actor_id", "text", (col) => col.notNull())
    .addColumn("name", "text")
    .addColumn("content", "text", (col) => col.notNull())
    .addColumn("keys", "text", (col) => col.notNull().defaultTo("[]"))
    .addColumn("secondary_keys", "text", (col) => col.defaultTo("[]"))
    .addColumn("selective", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("case_sensitive", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("enabled", "text", (col) => col.notNull().defaultTo("enabled"))
    .addColumn("constant", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("position", "text", (col) => col.notNull().defaultTo("before_char"))
    .addColumn("insertion_order", "integer", (col) => col.notNull().defaultTo(100))
    .addColumn("priority", "integer", (col) => col.notNull().defaultTo(100))
    .addColumn("comment", "text")
    .addColumn("sort_order", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .addColumn("updated_at", "text", (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .addForeignKeyConstraint("fk_ale_actor", ["actor_id"], "actors", ["id"])
    .addCheckConstraint(
      "ck_ale_enabled",
      sql`enabled IN ('enabled', 'disabled', 'archived')`,
    )
    .execute();

  await sql`INSERT INTO actor_lore_entries_ck SELECT * FROM actor_lore_entries`.execute(database);
  await database.schema.dropTable("actor_lore_entries").execute();
  await database.schema.alterTable("actor_lore_entries_ck").renameTo("actor_lore_entries").execute();
  await database.schema.createIndex("idx_actor_lore_actor").on("actor_lore_entries").column("actor_id").execute();
  await database.schema.createIndex("idx_actor_lore_position").on("actor_lore_entries").column("position").execute();

  await sql`PRAGMA foreign_keys = ON`.execute(database);
}

export async function down(database: Kysely<any>): Promise<void> {
  await sql`PRAGMA foreign_keys = OFF`.execute(database);

  // ── actor_lore_entries — remove CHECK(enabled) ──────────
  await database.schema
    .createTable("actor_lore_entries_nock")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("actor_id", "text", (col) => col.notNull())
    .addColumn("name", "text")
    .addColumn("content", "text", (col) => col.notNull())
    .addColumn("keys", "text", (col) => col.notNull().defaultTo("[]"))
    .addColumn("secondary_keys", "text", (col) => col.defaultTo("[]"))
    .addColumn("selective", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("case_sensitive", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("enabled", "text", (col) => col.notNull().defaultTo("enabled"))
    .addColumn("constant", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("position", "text", (col) => col.notNull().defaultTo("before_char"))
    .addColumn("insertion_order", "integer", (col) => col.notNull().defaultTo(100))
    .addColumn("priority", "integer", (col) => col.notNull().defaultTo(100))
    .addColumn("comment", "text")
    .addColumn("sort_order", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .addColumn("updated_at", "text", (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .addForeignKeyConstraint("fk_ale_actor", ["actor_id"], "actors", ["id"])
    .execute();

  await sql`INSERT INTO actor_lore_entries_nock SELECT * FROM actor_lore_entries`.execute(database);
  await database.schema.dropTable("actor_lore_entries").execute();
  await database.schema.alterTable("actor_lore_entries_nock").renameTo("actor_lore_entries").execute();
  await database.schema.createIndex("idx_actor_lore_actor").on("actor_lore_entries").column("actor_id").execute();
  await database.schema.createIndex("idx_actor_lore_position").on("actor_lore_entries").column("position").execute();

  // ── world_lore_entries — remove CHECK(enabled) ──────────
  await database.schema
    .createTable("world_lore_entries_nock")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("world_id", "text", (col) => col.notNull())
    .addColumn("name", "text")
    .addColumn("content", "text", (col) => col.notNull())
    .addColumn("keys", "text", (col) => col.notNull().defaultTo("[]"))
    .addColumn("secondary_keys", "text", (col) => col.defaultTo("[]"))
    .addColumn("selective", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("case_sensitive", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("enabled", "text", (col) => col.notNull().defaultTo("enabled"))
    .addColumn("constant", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("position", "text", (col) => col.notNull().defaultTo("before_char"))
    .addColumn("insertion_order", "integer", (col) => col.notNull().defaultTo(100))
    .addColumn("priority", "integer", (col) => col.notNull().defaultTo(100))
    .addColumn("comment", "text")
    .addColumn("sort_order", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .addColumn("updated_at", "text", (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .addForeignKeyConstraint("fk_wle_world", ["world_id"], "worlds", ["id"])
    .execute();

  await sql`INSERT INTO world_lore_entries_nock SELECT * FROM world_lore_entries`.execute(database);
  await database.schema.dropTable("world_lore_entries").execute();
  await database.schema.alterTable("world_lore_entries_nock").renameTo("world_lore_entries").execute();
  await database.schema.createIndex("idx_world_lore_world").on("world_lore_entries").column("world_id").execute();
  await database.schema.createIndex("idx_world_lore_position").on("world_lore_entries").column("position").execute();

  // ── chats — remove CHECK(type) ──────────────────────────
  await database.schema
    .createTable("chats_nock")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("type", "text", (col) => col.notNull().defaultTo("direct"))
    .addColumn("mode", "text", (col) => col.notNull().defaultTo("direct"))
    .addColumn("purpose", "text", (col) => col.notNull().defaultTo("main"))
    .addColumn("created_by", "text", (col) => col.notNull())
    .addColumn("world_id", "text")
    .addColumn("current_location_id", "text")
    .addColumn("story_state", "text")
    .addColumn("gm_config", "text")
    .addColumn("turn_strategy", "text")
    .addColumn("max_turns", "integer")
    .addColumn("auto_advance", "integer")
    .addColumn("parent_chat_id", "text")
    .addColumn("is_pinned", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .addColumn("updated_at", "text", (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .addForeignKeyConstraint("fk_chats_created_by", ["created_by"], "users", ["id"])
    .addForeignKeyConstraint("fk_chats_world", ["world_id"], "worlds", ["id"])
    .addForeignKeyConstraint("fk_chats_location", ["current_location_id"], "locations", ["id"])
    .execute();

  await sql`INSERT INTO chats_nock SELECT * FROM chats`.execute(database);
  await database.schema.dropTable("chats").execute();
  await database.schema.alterTable("chats_nock").renameTo("chats").execute();
  await database.schema.createIndex("idx_chats_created_by").on("chats").column("created_by").execute();
  await database.schema.createIndex("idx_chats_world").on("chats").column("world_id").execute();
  await database.schema.createIndex("idx_chats_location").on("chats").column("current_location_id").execute();
  await database.schema.createIndex("idx_chats_pinned").on("chats").column("is_pinned").execute();
  await database.schema.createIndex("idx_chats_parent").on("chats").column("parent_chat_id").execute();

  // ── users — remove CHECK(role) ──────────────────────────
  await database.schema
    .createTable("users_nock")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("username", "text", (col) => col.notNull().unique())
    .addColumn("display_name", "text", (col) => col.notNull())
    .addColumn("password_hash", "text")
    .addColumn("role", "text", (col) => col.notNull().defaultTo("user"))
    .addColumn("status", "text", (col) => col.notNull().defaultTo("active"))
    .addColumn("settings", "text", (col) => col.notNull().defaultTo("{}"))
    .addColumn("birth_date", "text")
    .addColumn("age_gate_accepted_at", "text")
    .addColumn("data_version", "integer", (col) => col.notNull().defaultTo(1))
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .addColumn("last_seen_at", "text")
    .execute();

  await sql`INSERT INTO users_nock SELECT * FROM users`.execute(database);
  await database.schema.dropTable("users").execute();
  await database.schema.alterTable("users_nock").renameTo("users").execute();
  await database.schema.createIndex("idx_users_role").on("users").column("role").execute();

  await sql`PRAGMA foreign_keys = ON`.execute(database);
}