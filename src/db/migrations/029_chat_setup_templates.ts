/**
 * Chat Setup Templates + Chat Template Binding — DB Schema
 *
 * Adds a `chat_setup_templates` table (config-declared presets selectable at chat
 * creation) and a `chats.template_id` FK recording which template established a
 * chat's key mechanics (the "binding").
 *
 * Key mechanics are immutable once a chat is online; changing them requires
 * migrating to a new chat bound to a different template. The `template_id` FK is
 * the snapshot binding — editing a template does not retroactively change chats
 * that already bound to it.
 *
 * See .plan/epics/epic-config-templates.md.
 */
import type { Kysely, } from "kysely";

/**
 * @param db
 */
export async function up(db: Kysely<unknown>,): Promise<void> {
  await db.schema
    .createTable("chat_setup_templates",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("slug", "text", (col,) => col.notNull().unique(),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("description", "text",)
    .addColumn("mode", "text",)
    .addColumn("turn_strategy", "text",)
    .addColumn("world_id", "text",)
    .addColumn("gm_config", "text",)
    .addColumn("visual_novel", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(new Date().toISOString(),),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(new Date().toISOString(),),)
    .execute();

  await db.schema
    .alterTable("chats",)
    .addColumn("template_id", "text", (col,) => col.references("chat_setup_templates.id",).onDelete("set null",),)
    .execute();
}

/**
 * @param db
 */
export async function down(db: Kysely<unknown>,): Promise<void> {
  await db.schema.alterTable("chats",).dropColumn("template_id",).execute();
  await db.schema.dropTable("chat_setup_templates",).execute();
}
