// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import { NotificationType, } from "../../db/enums-core";
import type { DB, } from "../../db/schema";
import { getChildLogger, } from "../../logger";
import { NotificationService, } from "./service";

/**
 * @param db
 * @param chatId
 */
async function participantActorIds(db: Kysely<DB>, chatId: string,): Promise<string[]> {
  const rows = await db
    .selectFrom("chat_participants",)
    .innerJoin("actors", "actors.id", "chat_participants.actor_id",)
    .select("actors.user_id",)
    .where("chat_id", "=", chatId,)
    .execute();

  return [...new Set(Array.from(rows, (r,) => r.user_id,).filter((id,): id is string => id != null),),];
}

/**
 * @param db
 * @param worldId
 */
async function worldParticipantActorIds(db: Kysely<DB>, worldId: string,): Promise<string[]> {
  const rows = await db
    .selectFrom("chat_participants",)
    .innerJoin("chats", "chats.id", "chat_participants.chat_id",)
    .innerJoin("actors", "actors.id", "chat_participants.actor_id",)
    .select("actors.user_id",)
    .where("chats.world_id", "=", worldId,)
    .execute();

  return [...new Set(Array.from(rows, (r,) => r.user_id,).filter((id,): id is string => id != null),),];
}

/**
 * Resolve the notification recipient for a mentioned actor.
 *
 * `notifications.user_id` REFERENCES `users(id)`, so an actor id is not a
 * valid recipient: writing it violated the FK and aborted the whole
 * mention fan-out. An AI character (actor row without a user) has no
 * recipient and is skipped; a user actor resolves to its owning user id.
 * Ids that are user ids without an actor row are accepted as-is.
 *
 * @param db
 * @param actorId
 * @returns {Promise<string | null>}
 */
async function resolveMentionUserId(db: Kysely<DB>, actorId: string,): Promise<string | null> {
  const actor = await db
    .selectFrom("actors",)
    .select("user_id",)
    .where("id", "=", actorId,)
    .executeTakeFirst();

  if (actor) { return actor.user_id ?? null; }

  const user = await db
    .selectFrom("users",)
    .select("id",)
    .where("id", "=", actorId,)
    .executeTakeFirst();

  return user?.id ?? null;
}

/**
 * @param db
 * @param opts
 * @param opts.chatId
 * @param opts.senderId
 * @param opts.mentionedActorIds
 * @param opts.messageId
 * @returns {Promise<number>} how many recipients were actually notified
 */
export async function notifyMention(
  db: Kysely<DB>,
  opts: { chatId: string; senderId: string; mentionedActorIds: string[]; messageId: string },
): Promise<number> {
  if (opts.mentionedActorIds.length === 0) { return 0; }
  const [chatResult, senderResult,] = await Promise.allSettled([
    db.selectFrom("chats",).select("name",).where("id", "=", opts.chatId,).executeTakeFirst(),
    db.selectFrom("actors",).select("display_name",).where("id", "=", opts.senderId,).executeTakeFirst(),
  ],);

  const senderName = senderResult.status === "fulfilled" ? senderResult.value?.display_name ?? "Someone" : "Someone";
  const chatName = chatResult.status === "fulfilled" ? chatResult.value?.name ?? "a chat" : "a chat";
  const svc = new NotificationService(db,);
  const log = getChildLogger("notifications",);
  let notified = 0;
  for (const actorId of opts.mentionedActorIds) {
    if (actorId === opts.senderId) { continue; }
    // The recipient is the actor's owning USER, never the actor id.
    // See BUG-notification-participant-helpers-write-actor-id-into-the-use.
    const userId = await resolveMentionUserId(db, actorId,);
    if (!userId) { continue; }
    try {
      await svc.create({
        userId,
        type: NotificationType.Mention,
        title: `${senderName} mentioned you`,
        body: `in "${chatName}"`,
        link: `/chat/${opts.chatId}`,
        data: { messageId: opts.messageId, chatId: opts.chatId, },
      },);

      notified++;
    } catch (err) {
      // One failed recipient must not swallow the remaining mentions.
      log?.warn("notifyMention: notification failed", { chatId: opts.chatId, userId, err, },);
    }
  }

  return notified;
}

/**
 * @param db
 * @param opts
 * @param opts.chatId
 * @param opts.invitedUserId
 * @param opts.inviterId
 * @returns {Promise<void>}
 */
export async function notifyChatInvite(
  db: Kysely<DB>,
  opts: { chatId: string; invitedUserId: string; inviterId: string },
): Promise<void> {
  const [chatResult, inviterResult,] = await Promise.allSettled([
    db.selectFrom("chats",).select("name",).where("id", "=", opts.chatId,).executeTakeFirst(),
    db.selectFrom("actors",).select("display_name",).where("id", "=", opts.inviterId,).executeTakeFirst(),
  ],);

  const inviterName = inviterResult.status === "fulfilled" ? inviterResult.value?.display_name ?? "Someone" : "Someone";
  const chatName = chatResult.status === "fulfilled" ? chatResult.value?.name ?? "a group chat" : "a group chat";
  await new NotificationService(db,).create({
    userId: opts.invitedUserId,
    type: NotificationType.ChatInvite,
    title: `Invited to "${chatName}"`,
    body: `${inviterName} added you`,
    link: `/chat/${opts.chatId}`,
    data: { chatId: opts.chatId, },
  },);
}

/**
 * @param db
 * @param opts
 * @param opts.worldId
 * @param opts.chatId
 * @param opts.questName
 * @returns {Promise<void>}
 */
export async function notifyQuestUpdate(
  db: Kysely<DB>,
  opts: { worldId?: string; chatId?: string; questName: string },
): Promise<void> {
  const svc = new NotificationService(db,);
  const userIds = opts.chatId
    ? await participantActorIds(db, opts.chatId,)
    : (opts.worldId
      ? await worldParticipantActorIds(db, opts.worldId,)
      : []);

  for (const userId of userIds) {
    await svc.create({
      userId,
      type: NotificationType.QuestUpdate,
      title: `Quest updated: ${opts.questName}`,
      link: opts.chatId ? `/chat/${opts.chatId}` : undefined,
      // Pass the world so the recipient's world mute applies.
      worldId: opts.worldId,
      data: { worldId: opts.worldId, chatId: opts.chatId, },
    },);
  }
}

/**
 * @param db
 * @param opts
 * @param opts.worldId
 * @param opts.description
 * @returns {Promise<void>}
 */
export async function notifyGmAction(
  db: Kysely<DB>,
  opts: { worldId: string; description: string },
): Promise<void> {
  const svc = new NotificationService(db,);
  const userIds = await worldParticipantActorIds(db, opts.worldId,);
  for (const userId of userIds) {
    await svc.create({
      userId,
      type: NotificationType.GmAction,
      title: "GM action",
      body: opts.description,
      worldId: opts.worldId,
      data: { worldId: opts.worldId, },
    },);
  }
}

/**
 * @param db
 * @param opts
 * @param opts.userId
 * @param opts.title
 * @param opts.body
 * @returns {Promise<void>}
 */
export async function notifySystem(
  db: Kysely<DB>,
  opts: { userId: string; title: string; body?: string },
): Promise<void> {
  await new NotificationService(db,).create({
    userId: opts.userId,
    type: NotificationType.System,
    title: opts.title,
    body: opts.body,
  },);
}

/**
 * @param db
 * @param opts
 * @param opts.userId
 * @param opts.postId
 * @param opts.title
 * @returns {Promise<void>}
 */
export async function notifyBlogPost(
  db: Kysely<DB>,
  opts: { userId: string; postId: string; title: string },
): Promise<void> {
  await new NotificationService(db,).create({
    userId: opts.userId,
    type: NotificationType.BlogPost,
    title: `New blog post: ${opts.title}`,
    data: { postId: opts.postId, },
  },);
}

/**
 * @param db
 * @param opts
 * @param opts.userId
 * @param opts.postId
 * @param opts.commenterName
 * @returns {Promise<void>}
 */
export async function notifyBlogComment(
  db: Kysely<DB>,
  opts: { userId: string; postId: string; commenterName: string },
): Promise<void> {
  await new NotificationService(db,).create({
    userId: opts.userId,
    type: NotificationType.BlogComment,
    title: `${opts.commenterName} commented on your post`,
    data: { postId: opts.postId, },
  },);
}
