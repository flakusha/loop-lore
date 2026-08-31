/**
 * Migration 023 — Chat schema additions: NSFW override + name_source
 *
 * Adds:
 * - `nsfw_override` on `chats` and `worlds`: per-chat/world NSFW policy override
 *   (null = use user pref, "enabled" = force on, "disabled" = force off)
 * - `name_source` on `chats`: tracks how the chat name was generated
 *   ("manual", "auto-rule", or "auto-llm")
 */
import { type Kysely, } from "kysely";

/**
 * @param database
 */
export async function up(database: Kysely<any>,): Promise<void> {
  // Add nsfw_override to chats (null = use user pref)
  await database.schema
    .alterTable("chats",)
    .addColumn("nsfw_override", "text",)
    .execute();

  // Add nsfw_override to worlds (null = use user pref)
  await database.schema
    .alterTable("worlds",)
    .addColumn("nsfw_override", "text",)
    .execute();

  // Add name_source to chats for auto-rename tracking
  await database.schema
    .alterTable("chats",)
    .addColumn("name_source", "text",)
    .execute();
}

/**
 * @param database
 */
export async function down(database: Kysely<any>,): Promise<void> {
  await database.schema.alterTable("chats",).dropColumn("name_source",).execute();
  await database.schema.alterTable("worlds",).dropColumn("nsfw_override",).execute();
  await database.schema.alterTable("chats",).dropColumn("nsfw_override",).execute();
}
