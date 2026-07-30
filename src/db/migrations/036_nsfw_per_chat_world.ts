/**
 * Migration 036 — Add per-chat and per-world NSFW override columns
 *
 * Allows chat/world owners to override the global NSFW policy:
 *   null = use user preference (default)
 *   "enabled" = force NSFW on for this chat/world
 *   "disabled" = force NSFW off for this chat/world
 *
 * Precedence: global config > per-chat > per-world > user preference
 */
import { type Kysely, } from "kysely";

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
}

export async function down(database: Kysely<any>,): Promise<void> {
  await database.schema.alterTable("worlds",).dropColumn("nsfw_override",).execute();
  await database.schema.alterTable("chats",).dropColumn("nsfw_override",).execute();
}
