import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { jsonStringifyOr, } from "../../../utils";
import type { CreateChatParams, } from "../types";

/**
 * Create a new chat with owner and optional participants.
 *
 * @returns The new chat ID
 */
export async function createChat(
  database: Kysely<DB>,
  params: CreateChatParams,
): Promise<string> {
  const newChatId = crypto.randomUUID();

  await database
    .insertInto("chats",)
    .values({
      id: newChatId,
      name: params.name,
      type: (params.type as never) ?? "direct",
      mode: (params.mode as never) ?? "direct",
      created_by: params.createdBy,
      world_id: params.worldId ?? null,
      current_location_id: params.currentLocationId ?? null,
      turn_strategy: (params.turnStrategy as never) ?? null,
      gm_config: params.gmConfig ? jsonStringifyOr(params.gmConfig,) : null,
      visual_novel: params.visualNovel ? 1 : 0,
      template_id: params.templateId ?? null,
      visibility: params.visibility ?? "private",
    },)
    .execute();

  // Add owner
  await database
    .insertInto("chat_participants",)
    .values({ chat_id: newChatId, actor_id: params.createdBy, role_in_chat: "owner", },)
    .execute();

  // Add additional participants
  if (params.participantIds && params.participantIds.length > 0) {
    for (const actorId of params.participantIds) {
      try {
        await database
          .insertInto("chat_participants",)
          .values({ chat_id: newChatId, actor_id: actorId, role_in_chat: "member", },)
          .execute();
      } catch {
        /* skip duplicate */
      }
    }
  }

  // Carry participant memories into the new chat. Mirrors the migrateChat
  // semantic: duplicate the selected source memories with source_chat_id set
  // to the new chat so the injected context is scoped to this chat.
  if (params.memoryCarry && params.memoryCarry !== "fresh" && params.participantIds?.[0]) {
    const sourceActorId = params.participantIds[0];
    const selectiveIds = params.memoryCarry === "selective" && params.memoryCarryIds?.length
      ? params.memoryCarryIds
      : undefined;
    const selections = await database
      .selectFrom("actor_memories",)
      .select([
        "id",
        "actor_id",
        "source_chat_id",
        "memory_type",
        "content",
        "importance",
        "last_accessed_at",
        "created_at",
        "source_message_id",
        "context",
        "world_id",
        "user_id",
      ],)
      .where("actor_id", "=", sourceActorId,)
      .$if(!!selectiveIds?.length, (qb,) => qb.where("id", "in", selectiveIds as string[],),)
      .execute();
    for (const m of selections) {
      await database
        .insertInto("actor_memories",)
        .values({
          id: crypto.randomUUID(),
          actor_id: m.actor_id,
          source_chat_id: newChatId,
          memory_type: m.memory_type,
          content: m.content,
          importance: m.importance,
          last_accessed_at: m.last_accessed_at,
          created_at: m.created_at,
          source_message_id: m.source_message_id,
          context: m.context,
          world_id: m.world_id,
          user_id: m.user_id,
        },)
        .execute();
    }
  }

  return newChatId;
}
