import type { Kysely, } from "kysely";
import { generateRuleName, } from "../../chat";
import type { DB, } from "../../db/schema";
import { log, } from "./helpers";

/** Chat rows fetched once by the create handler and shared by post-insert side effects. */
export interface ChatRecord {
  name: string | null;
  mode: string | null;
  current_location_id: string | null;
  world_id: string | null;
}

/**
 * Auto-rename a direct chat from its default placeholder name after the first
 * user message, based on the character and current location.
 */
export async function autoRenameChat(
  database: Kysely<DB>,
  chatId: string,
  effectiveContent: string,
  chatRecord: ChatRecord | undefined,
): Promise<void> {
  if (
    chatRecord?.mode !== "direct" ||
    (chatRecord.name !== "New Chat" && chatRecord.name !== "")
  ) {
    return;
  }

  const charActor = await database
    .selectFrom("chat_participants",)
    .innerJoin("actors", "actors.id", "chat_participants.actor_id",)
    .select(["actors.display_name",],)
    .where("chat_participants.chat_id", "=", chatId,)
    .where("actors.agent_type", "in", ["ai", "narrator", "npc",],)
    .executeTakeFirst();

  let locationName: string | null = null;
  if (chatRecord.current_location_id) {
    const loc = await database
      .selectFrom("locations",)
      .select("name",)
      .where("id", "=", chatRecord.current_location_id,)
      .executeTakeFirst();
    locationName = loc?.name ?? null;
  }

  const renameResult = generateRuleName(
    charActor?.display_name ?? "",
    locationName,
    effectiveContent,
  );

  await database
    .updateTable("chats",)
    .set({ name: renameResult.name, updated_at: new Date().toISOString(), },)
    .where("id", "=", chatId,)
    .execute();

  log().debug("Auto-renamed chat", { chatId, newName: renameResult.name, },);
}