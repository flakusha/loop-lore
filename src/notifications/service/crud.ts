// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { safeJsonStringify, uid, } from "../../utils";
import { getPrefs, } from "./prefs";
import type { NotificationInput, NotificationRecord, NotificationRow, } from "./types";

function mapRow(r: NotificationRow,): NotificationRecord {
  return {
    id: r.id,
    userId: r.user_id,
    type: r.type,
    title: r.title,
    body: r.body,
    link: r.link,
    read: r.read,
    data: r.data,
    createdAt: r.created_at,
  };
}

/**
 * Create a notification, skipping when the type is disabled for the user or
 * when the linked world is muted.
 */
export async function createNotification(
  db: Kysely<DB>,
  input: NotificationInput,
): Promise<void> {
  const prefs = await getPrefs(db, input.userId,);
  if (!prefs.enabled[input.type]) { return; }
  if (input.worldId && prefs.mutedWorlds.includes(input.worldId,)) { return; }

  const data = input.data ? safeJsonStringify(input.data,) : null;
  await db
    .insertInto("notifications",)
    .values({
      id: uid(),
      user_id: input.userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
      read: "unread",
      data: data?.ok ? data.value : null,
      created_at: new Date().toISOString(),
    },)
    .execute();
}

/** Newest-first list, optionally unread only. */
export async function listNotifications(
  db: Kysely<DB>,
  userId: string,
  unreadOnly = false,
): Promise<NotificationRecord[]> {
  let query = db.selectFrom("notifications",).selectAll().where("user_id", "=", userId,);
  if (unreadOnly) { query = query.where("read", "=", "unread",); }
  const rows = await query.orderBy("created_at", "desc",).limit(50,).execute();
  return Array.from(rows, (row,) => mapRow(row,),);
}

/** Count of unread notifications for a user. */
export async function getUnreadCount(db: Kysely<DB>, userId: string,): Promise<number> {
  const row = await db
    .selectFrom("notifications",)
    .select((eb,) => eb.fn.countAll<number>().as("count",))
    .where("user_id", "=", userId,)
    .where("read", "=", "unread",)
    .executeTakeFirst();
  return row?.count ?? 0;
}

/** Mark a single notification read (ownership-checked). */
export async function markNotificationRead(
  db: Kysely<DB>,
  id: string,
  userId: string,
): Promise<void> {
  await db
    .updateTable("notifications",)
    .set({ read: "read", },)
    .where("id", "=", id,)
    .where("user_id", "=", userId,)
    .execute();
}

/** Mark every notification read for a user. */
export async function markAllNotificationsRead(
  db: Kysely<DB>,
  userId: string,
): Promise<void> {
  await db
    .updateTable("notifications",)
    .set({ read: "read", },)
    .where("user_id", "=", userId,)
    .where("read", "=", "unread",)
    .execute();
}

/** Delete a notification (ownership-checked). */
export async function deleteNotification(
  db: Kysely<DB>,
  id: string,
  userId: string,
): Promise<void> {
  await db.deleteFrom("notifications",).where("id", "=", id,).where("user_id", "=", userId,).execute();
}

/**
 * Build the `[Recent Events]` block injected into the LLM prompt so
 * characters stay aware of off-screen activity. Returns "" when empty.
 */
export async function buildRecentEvents(
  db: Kysely<DB>,
  userId: string,
  chatId?: string,
): Promise<string> {
  let query = db.selectFrom("notifications",).selectAll().where("user_id", "=", userId,);
  if (chatId) { query = query.where("link", "like", `%${chatId}%`,); }
  const rows = await query.orderBy("created_at", "desc",).limit(5,).execute();
  if (rows.length === 0) { return ""; }
  const lines = Array.from(rows, (r,) => {
    const bodyPart = r.body ? `: ${r.body}` : "";
    return `- ${r.title}${bodyPart}`;
  },);
  return `[Recent Events]\n${lines.join("\n",)}`;
}
