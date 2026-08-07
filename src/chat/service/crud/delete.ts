import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";

/**
 * Delete a chat and all its related data (cascade).
 */
export async function deleteChat(
  database: Kysely<DB>,
  chatId: string,
): Promise<void> {
  await database.deleteFrom("generation_attempts",).where("chat_id", "=", chatId,).execute();
  await database
    .deleteFrom("world_states",)
    .where((eb,) =>
      eb.or([
        eb(
          "trigger_message_id",
          "in",
          database.selectFrom("messages",).select("id",).where("chat_id", "=", chatId,),
        ),
        eb(
          "trigger_turn_id",
          "in",
          database.selectFrom("story_turns",).select("id",).where("chat_id", "=", chatId,),
        ),
      ],)
    )
    .execute();
  await database.deleteFrom("story_turns",).where("chat_id", "=", chatId,).execute();
  await database.deleteFrom("quest_progress",).where("chat_id", "=", chatId,).execute();
  await database.deleteFrom("synthetic_data",).where("chat_id", "=", chatId,).execute();
  await database.deleteFrom("actor_memories",).where("source_chat_id", "=", chatId,).execute();
  await database
    .deleteFrom("asset_links",)
    .where("entity_type", "=", "chat",)
    .where("entity_id", "=", chatId,)
    .execute();
  await database.deleteFrom("messages",).where("chat_id", "=", chatId,).execute();
  await database.deleteFrom("chat_participants",).where("chat_id", "=", chatId,).execute();
  await database.deleteFrom("chats",).where("id", "=", chatId,).execute();
}
