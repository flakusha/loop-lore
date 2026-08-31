/**
 * Migration 037 — Add moderation appeals table
 *
 * Allows users to appeal moderation actions (block, ban, shadow).
 * Appeals are reviewed by moderators and can be approved or denied.
 */
import { type Kysely, } from "kysely";

/**
 * @param database
 */
export async function up(database: Kysely<any>,): Promise<void> {
  await database.schema
    .createTable("moderation_appeals",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("user_id", "text", (col,) => col.notNull(),)
    .addColumn("action_id", "text", (col,) =>
      col.notNull()
        .references("moderation_actions.id",).onDelete("cascade",),)
    .addColumn("reason", "text", (col,) => col.notNull(),)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("pending",),) // pending | approved | denied
    .addColumn("reviewed_by", "text",)
    .addColumn("review_note", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text",)
    .execute();
}

/**
 * @param database
 */
export async function down(database: Kysely<any>,): Promise<void> {
  await database.schema.dropTable("moderation_appeals",).execute();
}
