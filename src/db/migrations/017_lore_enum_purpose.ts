/**
 * Migration 017 — Schema Hardening
 *
 * Convert remaining bare integer/text columns to typed string enums:
 * - `actor_lore_entries.enabled`: integer → LoreEntryStatus ("enabled"/"disabled")
 * - `world_lore_entries.enabled`: integer → LoreEntryStatus ("enabled"/"disabled")
 * - `chats.purpose`: add missing column with ChatPurpose default
 * - `actor_keys.public_key`: add missing column
 * - `actor_memories.memory_type`: default "fact" → "episodic"
 */
import type { Kysely } from "kysely";

export async function up(database: Kysely<any>): Promise<void> {
  // ── actor_lore_entries.enabled — integer → text ────────────
  await database.schema
    .alterTable("actor_lore_entries")
    .addColumn("enabled_new", "text", (col) => col.notNull().defaultTo("enabled"))
    .execute();

  await database
    .updateTable("actor_lore_entries")
    .set({ enabled_new: "disabled" } as any)
    .where("enabled", "=", 0)
    .execute();

  await database.schema.alterTable("actor_lore_entries").dropColumn("enabled").execute();
  await database.schema.alterTable("actor_lore_entries").renameColumn("enabled_new", "enabled").execute();

  // ── world_lore_entries.enabled — integer → text ────────────
  await database.schema
    .alterTable("world_lore_entries")
    .addColumn("enabled_new", "text", (col) => col.notNull().defaultTo("enabled"))
    .execute();

  await database
    .updateTable("world_lore_entries")
    .set({ enabled_new: "disabled" } as any)
    .where("enabled", "=", 0)
    .execute();

  await database.schema.alterTable("world_lore_entries").dropColumn("enabled").execute();
  await database.schema.alterTable("world_lore_entries").renameColumn("enabled_new", "enabled").execute();

  // ── chats.purpose — add missing column ─────────────────────
  await database.schema
    .alterTable("chats")
    .addColumn("purpose", "text", (col) => col.notNull().defaultTo("main"))
    .execute();

  // ── actor_keys.public_key — add missing column ─────────────
  await database.schema
    .alterTable("actor_keys")
    .addColumn("public_key", "text")
    .execute();
}

export async function down(database: Kysely<any>): Promise<void> {
  // ── actor_keys.public_key — remove column ──────────────────
  await database.schema.alterTable("actor_keys").dropColumn("public_key").execute();

  // ── chats.purpose — remove column ──────────────────────────
  await database.schema.alterTable("chats").dropColumn("purpose").execute();

  // ── world_lore_entries.enabled — text → integer ────────────
  await database.schema
    .alterTable("world_lore_entries")
    .addColumn("enabled_old", "integer", (col) => col.notNull().defaultTo(1))
    .execute();

  await database
    .updateTable("world_lore_entries")
    .set({ enabled_old: 0 } as any)
    .where("enabled", "=", "disabled")
    .execute();

  await database.schema.alterTable("world_lore_entries").dropColumn("enabled").execute();
  await database.schema.alterTable("world_lore_entries").renameColumn("enabled_old", "enabled").execute();

  // ── actor_lore_entries.enabled — text → integer ────────────
  await database.schema
    .alterTable("actor_lore_entries")
    .addColumn("enabled_old", "integer", (col) => col.notNull().defaultTo(1))
    .execute();

  await database
    .updateTable("actor_lore_entries")
    .set({ enabled_old: 0 } as any)
    .where("enabled", "=", "disabled")
    .execute();

  await database.schema.alterTable("actor_lore_entries").dropColumn("enabled").execute();
  await database.schema.alterTable("actor_lore_entries").renameColumn("enabled_old", "enabled").execute();
}
