import type { Kysely, } from "kysely";

/**
 * Migration 010 — Boolean-as-integer to enum conversion
 *
 * Converts boolean integer flags (0/1) to proper text enums:
 * - `chats.is_pinned`: integer → PinnedState ("unpinned"/"pinned")
 * - `personas.is_default`: integer → DefaultState ("not_default"/"default")
 * - `actor_notes.pinned`: integer → PinnedState ("unpinned"/"pinned")
 * - `actor_items.equipped`: integer → EquipState ("unequipped"/"equipped")
 * - `items.stackable`: integer → StackableState ("unique"/"stackable")
 */
export async function up(database: Kysely<any>,): Promise<void> {
  // ── chats.is_pinned ────────────────────────────────────────
  await database.schema
    .alterTable("chats",)
    .addColumn("is_pinned_new", "text", (col,) => col.notNull().defaultTo("unpinned",),)
    .execute();

  await database
    .updateTable("chats",)
    .set({ is_pinned_new: "pinned", } as any,)
    .where("is_pinned", "=", 1,)
    .execute();

  // Drop index before dropping column (SQLite constraint)
  await database.schema.dropIndex("idx_chats_pinned",).ifExists().execute();
  await database.schema.alterTable("chats",).dropColumn("is_pinned",).execute();
  await database.schema.alterTable("chats",).renameColumn("is_pinned_new", "is_pinned",).execute();
  await database.schema.createIndex("idx_chats_pinned",).on("chats",).column("is_pinned",).execute();

  // ── personas.is_default ────────────────────────────────────
  await database.schema
    .alterTable("personas",)
    .addColumn("is_default_new", "text", (col,) => col.notNull().defaultTo("not_default",),)
    .execute();

  await database
    .updateTable("personas",)
    .set({ is_default_new: "default", } as any,)
    .where("is_default", "=", 1,)
    .execute();

  // Drop index before dropping column (SQLite constraint)
  await database.schema.dropIndex("idx_personas_default",).ifExists().execute();
  await database.schema.alterTable("personas",).dropColumn("is_default",).execute();
  await database.schema.alterTable("personas",).renameColumn("is_default_new", "is_default",).execute();
  await database.schema
    .createIndex("idx_personas_default",)
    .on("personas",)
    .column("user_id",)
    .column("is_default",)
    .execute();

  // ── actor_notes.pinned ─────────────────────────────────────
  await database.schema
    .alterTable("actor_notes",)
    .addColumn("pinned_new", "text", (col,) => col.notNull().defaultTo("unpinned",),)
    .execute();

  await database
    .updateTable("actor_notes",)
    .set({ pinned_new: "pinned", } as any,)
    .where("pinned", "=", 1,)
    .execute();

  await database.schema.alterTable("actor_notes",).dropColumn("pinned",).execute();
  await database.schema.alterTable("actor_notes",).renameColumn("pinned_new", "pinned",).execute();

  // ── actor_items.equipped ───────────────────────────────────
  await database.schema
    .alterTable("actor_items",)
    .addColumn("equipped_new", "text", (col,) => col.notNull().defaultTo("unequipped",),)
    .execute();

  await database
    .updateTable("actor_items",)
    .set({ equipped_new: "equipped", } as any,)
    .where("equipped", "=", 1,)
    .execute();

  await database.schema.alterTable("actor_items",).dropColumn("equipped",).execute();
  await database.schema.alterTable("actor_items",).renameColumn("equipped_new", "equipped",).execute();

  // ── items.stackable ────────────────────────────────────────
  await database.schema
    .alterTable("items",)
    .addColumn("stackable_new", "text", (col,) => col.notNull().defaultTo("unique",),)
    .execute();

  await database
    .updateTable("items",)
    .set({ stackable_new: "stackable", } as any,)
    .where("stackable", "=", 1,)
    .execute();

  await database.schema.alterTable("items",).dropColumn("stackable",).execute();
  await database.schema.alterTable("items",).renameColumn("stackable_new", "stackable",).execute();
}

export async function down(database: Kysely<any>,): Promise<void> {
  // ── items.stackable ────────────────────────────────────────
  await database.schema
    .alterTable("items",)
    .addColumn("stackable_old", "integer", (col,) => col.notNull().defaultTo(0,),)
    .execute();

  await database
    .updateTable("items",)
    .set({ stackable_old: 1, } as any,)
    .where("stackable", "=", "stackable",)
    .execute();

  await database.schema.alterTable("items",).dropColumn("stackable",).execute();
  await database.schema.alterTable("items",).renameColumn("stackable_old", "stackable",).execute();

  // ── actor_items.equipped ───────────────────────────────────
  await database.schema
    .alterTable("actor_items",)
    .addColumn("equipped_old", "integer", (col,) => col.notNull().defaultTo(0,),)
    .execute();

  await database
    .updateTable("actor_items",)
    .set({ equipped_old: 1, } as any,)
    .where("equipped", "=", "equipped",)
    .execute();

  await database.schema.alterTable("actor_items",).dropColumn("equipped",).execute();
  await database.schema.alterTable("actor_items",).renameColumn("equipped_old", "equipped",).execute();

  // ── actor_notes.pinned ─────────────────────────────────────
  await database.schema
    .alterTable("actor_notes",)
    .addColumn("pinned_old", "integer", (col,) => col.notNull().defaultTo(0,),)
    .execute();

  await database
    .updateTable("actor_notes",)
    .set({ pinned_old: 1, } as any,)
    .where("pinned", "=", "pinned",)
    .execute();

  await database.schema.alterTable("actor_notes",).dropColumn("pinned",).execute();
  await database.schema.alterTable("actor_notes",).renameColumn("pinned_old", "pinned",).execute();

  // ── personas.is_default ────────────────────────────────────
  await database.schema
    .alterTable("personas",)
    .addColumn("is_default_old", "integer", (col,) => col.notNull().defaultTo(0,),)
    .execute();

  await database
    .updateTable("personas",)
    .set({ is_default_old: 1, } as any,)
    .where("is_default", "=", "default",)
    .execute();

  // Drop index before dropping column (SQLite constraint)
  await database.schema.dropIndex("idx_personas_default",).ifExists().execute();
  await database.schema.alterTable("personas",).dropColumn("is_default",).execute();
  await database.schema.alterTable("personas",).renameColumn("is_default_old", "is_default",).execute();
  await database.schema
    .createIndex("idx_personas_default",)
    .on("personas",)
    .column("user_id",)
    .column("is_default",)
    .execute();

  // ── chats.is_pinned ────────────────────────────────────────
  await database.schema
    .alterTable("chats",)
    .addColumn("is_pinned_old", "integer", (col,) => col.notNull().defaultTo(0,),)
    .execute();

  await database
    .updateTable("chats",)
    .set({ is_pinned_old: 1, } as any,)
    .where("is_pinned", "=", "pinned",)
    .execute();

  // Drop index before dropping column (SQLite constraint)
  await database.schema.dropIndex("idx_chats_pinned",).ifExists().execute();
  await database.schema.alterTable("chats",).dropColumn("is_pinned",).execute();
  await database.schema.alterTable("chats",).renameColumn("is_pinned_old", "is_pinned",).execute();
  await database.schema.createIndex("idx_chats_pinned",).on("chats",).column("is_pinned",).execute();
}
