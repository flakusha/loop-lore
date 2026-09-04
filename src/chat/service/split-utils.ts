// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Party split/reunion helpers. Kept in a separate file to keep split.ts ≤250L.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { injectNarration, } from "./transitions";

/** Fields copied from source chat when creating a branch chat. */
interface BranchChatFields {
  type: string;
  mode: string;
  gm_config: string | null;
  world_id: string | null;
}

/**
 * Create one branch chat for party split.
 * Returns the new chat ID and participant count.
 * @param database
 * @param sourceChatId
 * @param source
 * @param branchName
 * @param locationId
 * @param actorIds
 * @param actorId
 */
export async function createBranchChat(
  database: Kysely<DB>,
  sourceChatId: string,
  source: BranchChatFields,
  branchName: string,
  locationId: string,
  actorIds: string[],
  actorId: string,
): Promise<{ chatId: string; locationId: string; participantCount: number }> {
  const chatId = crypto.randomUUID();

  await database
    .insertInto("chats",)
    .values({
      id: chatId,
      name: `${sourceChatId} — ${branchName}`,
      type: source.type as never,
      mode: source.mode as never,
      created_by: actorId,
      world_id: source.world_id,
      current_location_id: locationId || null,
      gm_config: source.gm_config,
      parent_chat_id: sourceChatId,
      template_id: null,
    },)
    .execute();

  for (const aId of actorIds) {
    await database
      .insertInto("chat_participants",)
      .values({ chat_id: chatId, actor_id: aId, },)
      .execute();
  }

  await injectNarration(
    database,
    chatId,
    `The party splits — **${branchName}** heads off on their own path...`,
  );

  return { chatId, locationId, participantCount: actorIds.length, };
}

/**
 * Merge participants from secondary chat into primary, deduplicating by actor_id.
 * Returns the count of newly added participants.
 * @param database
 * @param primaryChatId
 * @param secondaryChatId
 */
export async function mergeParticipantsIntoPrimary(
  database: Kysely<DB>,
  primaryChatId: string,
  secondaryChatId: string,
): Promise<number> {
  const primaryActors = await database
    .selectFrom("chat_participants",)
    .select("actor_id",)
    .where("chat_id", "=", primaryChatId,)
    .execute();

  const primaryActorIds = new Set<string>();
  for (const p of primaryActors) {
    primaryActorIds.add(p.actor_id,);
  }

  const secondaryParticipants = await database
    .selectFrom("chat_participants",)
    .selectAll()
    .where("chat_id", "=", secondaryChatId,)
    .execute();

  let added = 0;
  for (const p of secondaryParticipants) {
    if (primaryActorIds.has(p.actor_id,)) {
      continue;
    }

    await database
      .insertInto("chat_participants",)
      .values({
        chat_id: primaryChatId,
        actor_id: p.actor_id,
        role_in_chat: p.role_in_chat,
        persona_id: p.persona_id,
        impersonate_actor_id: p.impersonate_actor_id,
      },)
      .execute();
    added++;
  }

  return added;
}

/**
 * Copy all messages from secondary chat into primary in chronological order.
 * Returns the count of merged messages.
 * @param database
 * @param primaryChatId
 * @param secondaryChatId
 */
export async function copyMessagesToPrimary(
  database: Kysely<DB>,
  primaryChatId: string,
  secondaryChatId: string,
): Promise<number> {
  const secondaryMessages = await database
    .selectFrom("messages",)
    .selectAll()
    .where("chat_id", "=", secondaryChatId,)
    .orderBy("created_at", "asc",)
    .execute();

  for (const msg of secondaryMessages) {
    await database
      .insertInto("messages",)
      .values({
        id: crypto.randomUUID(),
        chat_id: primaryChatId,
        actor_id: msg.actor_id,
        parent_id: null,
        role: msg.role,
        content: msg.content,
        key_id: msg.key_id,
        content_type: msg.content_type,
        content_format: msg.content_format,
        content_encoding: msg.content_encoding,
        status: msg.status,
        visibility: msg.visibility,
        swipe_index: msg.swipe_index,
        created_at: msg.created_at,
        edited_at: msg.edited_at,
        attachments: msg.attachments,
        archived_at: null,
        section_id: null,
      },)
      .execute();
  }

  return secondaryMessages.length;
}
