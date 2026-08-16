// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import { NotificationType, } from "../../db/enums-core";
import type { DB, } from "../../db/schema";
import { NotificationService, } from "./service";

async function participantActorIds(db: Kysely<DB>, chatId: string,): Promise<string[]> {
  const rows = await db
    .selectFrom("chat_participants",)
    .select("actor_id",)
    .where("chat_id", "=", chatId,)
    .execute();
  return Array.from(rows, (r,) => r.actor_id,);
}

async function worldParticipantActorIds(db: Kysely<DB>, worldId: string,): Promise<string[]> {
  const rows = await db
    .selectFrom("chat_participants",)
    .select("chat_participants.actor_id",)
    .innerJoin("chats", "chats.id", "chat_participants.chat_id",)
    .where("chats.world_id", "=", worldId,)
    .execute();
  return [...new Set(Array.from(rows, (r,) => r.actor_id,),),];
}

export async function notifyMention(
  db: Kysely<DB>,
  opts: { chatId: string; senderId: string; mentionedActorIds: string[]; messageId: string },
): Promise<void> {
  if (opts.mentionedActorIds.length === 0) { return; }
  const [chatResult, senderResult,] = await Promise.allSettled([
    db.selectFrom("chats",).select("name",).where("id", "=", opts.chatId,).executeTakeFirst(),
    db.selectFrom("actors",).select("display_name",).where("id", "=", opts.senderId,).executeTakeFirst(),
  ],);
  const senderName = senderResult.status === "fulfilled" ? senderResult.value?.display_name ?? "Someone" : "Someone";
  const chatName = chatResult.status === "fulfilled" ? chatResult.value?.name ?? "a chat" : "a chat";
  const svc = new NotificationService(db,);
  for (const actorId of opts.mentionedActorIds) {
    if (actorId === opts.senderId) { continue; }
    await svc.create({
      userId: actorId,
      type: NotificationType.Mention,
      title: `${senderName} mentioned you`,
      body: `in "${chatName}"`,
      link: `/chat/${opts.chatId}`,
      data: { messageId: opts.messageId, chatId: opts.chatId, },
    },);
  }
}

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
      data: { worldId: opts.worldId, chatId: opts.chatId, },
    },);
  }
}

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
