// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 049_plan_items
 *
 * Step-planning tables (epic-assistant-step-planning):
 *   - plan_items: user-owned planning items with state machine
 *   - plan_links: append-only directed edges between plan items
 *
 * Numbering: authored as 047, but 047 is the first free slot on dev and is
 * taken by 047_conversation_merge (feat-branch-merge). Finalize order is
 * 047_conversation_merge -> 048_chats_timeline_id (followup-timeline-scope)
 * -> 049_plan_items (this branch), so the prefix run stays gapless at every
 * finalize boundary. Never applied to any DB, so no kysely_migration row
 * holds an earlier name.
 */
import type { Kysely, } from "kysely";
import { sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("plan_items",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("owner_id", "text", (col,) => col.notNull().references("users.id",).onDelete("cascade",),)
    .addColumn("chat_id", "text", (col,) => col.references("chats.id",).onDelete("cascade",),)
    .addColumn("title", "text", (col,) => col.notNull(),)
    .addColumn("state", "text", (col,) => col.notNull().defaultTo("todo",),)
    .addColumn("kind", "text", (col,) => col.notNull().defaultTo("step",),)
    .addColumn("position", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("parent_id", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await sql`
    CREATE INDEX IF NOT EXISTS idx_plan_items_owner ON plan_items (owner_id, state)
  `.execute(database,);

  await sql`
    CREATE INDEX IF NOT EXISTS idx_plan_items_chat ON plan_items (chat_id)
  `.execute(database,);

  await database.schema
    .createTable("plan_links",)
    .addColumn("from_id", "text", (col,) => col.notNull().references("plan_items.id",).onDelete("cascade",),)
    .addColumn("to_id", "text", (col,) => col.notNull().references("plan_items.id",).onDelete("cascade",),)
    .addColumn("relation", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addPrimaryKeyConstraint("pk_plan_links", ["from_id", "to_id", "relation",],)
    .execute();

  await sql`
    CREATE INDEX IF NOT EXISTS idx_plan_links_from ON plan_links (from_id)
  `.execute(database,);

  await sql`
    CREATE INDEX IF NOT EXISTS idx_plan_links_to ON plan_links (to_id)
  `.execute(database,);
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await sql`DROP INDEX IF EXISTS idx_plan_links_to`.execute(database,);
  await sql`DROP INDEX IF EXISTS idx_plan_links_from`.execute(database,);
  await database.schema.dropTable("plan_links",).execute();
  await sql`DROP INDEX IF EXISTS idx_plan_items_chat`.execute(database,);
  await sql`DROP INDEX IF EXISTS idx_plan_items_owner`.execute(database,);
  await database.schema.dropTable("plan_items",).execute();
}
