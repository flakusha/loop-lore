/**
 * Chat Sections — Multi-Location Chat Spanning — DB Schema
 *
 * Lets a single chat span multiple locations by dividing its message stream
 * into ordered `chat_sections`, each optionally bound to a `location_id` and/or
 * a `background_id`. This is additive on top of the existing single
 * `chats.current_location_id` link (which stays authoritative for the chat's
 * "current" location); sections provide the richer, ordered grouping.
 *
 * `messages.section_id` is a nullable FK so older messages remain valid while
 * users opt existing/new messages into a section.
 *
 * See .plan/tickets/TASK-chat-sectioning-multi-location.md.
 */
import type { Kysely, } from "kysely";

/**
 * @param db
 */
export async function up(db: Kysely<unknown>,): Promise<void> {
  await db.schema
    .createTable("chat_sections",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.references("chats.id",).onDelete("cascade",).notNull(),)
    .addColumn("label", "text", (col,) => col.notNull(),)
    .addColumn("description", "text",)
    .addColumn("location_id", "text", (col,) => col.references("locations.id",).onDelete("set null",),)
    .addColumn("sort_index", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(new Date().toISOString(),),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(new Date().toISOString(),),)
    .execute();

  // Ordered per-chat lookups (list + reorder) scan one chat's sections in order.
  await db.schema
    .createIndex("chat_sections_chat_sort_idx",)
    .on("chat_sections",)
    .columns(["chat_id", "sort_index",],)
    .execute();

  // Message -> section membership (nullable; NULL = not yet sectioned).
  await db.schema
    .alterTable("messages",)
    .addColumn("section_id", "text", (col,) => col.references("chat_sections.id",).onDelete("set null",),)
    .execute();
}

/**
 * @param db
 */
export async function down(db: Kysely<unknown>,): Promise<void> {
  await db.schema.alterTable("messages",).dropColumn("section_id",).execute();
  await db.schema.dropIndex("chat_sections_chat_sort_idx",).execute();
  await db.schema.dropTable("chat_sections",).execute();
}
