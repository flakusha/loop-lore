import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
  // ── Users ──────────────────────────────────────────────────
  await database.schema
    .createTable("users")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("username", "text", (col) => col.notNull().unique())
    .addColumn("display_name", "text", (col) => col.notNull())
    .addColumn("password_hash", "text")
    .addColumn("role", "text", (col) => col.notNull().defaultTo("user"))
    .addColumn("status", "text", (col) => col.notNull().defaultTo("active"))
    .addColumn("settings", "text", (col) => col.notNull().defaultTo("{}"))
    .addColumn("birth_date", "text")
    .addColumn("age_gate_accepted_at", "text")
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .addColumn("last_seen_at", "text")
    .execute();

  await database.schema.createIndex("idx_users_role").on("users").column("role").execute();

  // ── Sessions ────────────────────────────────────────────────
  await database.schema
    .createTable("sessions")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("user_id", "text", (col) => col.notNull().references("users.id"))
    .addColumn("token_hash", "text", (col) => col.notNull())
    .addColumn("ip", "text")
    .addColumn("user_agent", "text")
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .addColumn("last_activity", "text", (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .addColumn("expires_at", "text", (col) => col.notNull())
    .execute();

  await database.schema.createIndex("idx_sessions_user_id").on("sessions").column("user_id").execute();
  await database.schema.createIndex("idx_sessions_token_hash").on("sessions").column("token_hash").execute();
  await database.schema.createIndex("idx_sessions_user_expires").on("sessions").columns(["user_id", "expires_at"]).execute();
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await database.schema.dropTable("sessions").execute();
  await database.schema.dropTable("users").execute();
}
