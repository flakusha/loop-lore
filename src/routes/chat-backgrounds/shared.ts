// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat backgrounds — shared helpers: chat access guard and background schemas.
 */
import { t, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { can, } from "../../users/permissions";

export const BACKGROUND_TYPES = ["static", "parallax", "animated", "video", "particle",];

export const OptionalNullableString = t.Optional(t.Union([t.String(), t.Null(),],),);

export const ChatBackgroundCreateBody = t.Object({
  name: t.String(),
  type: t.Optional(t.String(),),
  locationId: OptionalNullableString,
  assetId: OptionalNullableString,
  config: OptionalNullableString,
  priority: t.Optional(t.Number(),),
},);

/**
 * @param database
 * @param chatId
 * @param userId
 * @param userRole
 */
export async function chatAccess(
  database: Kysely<DB>,
  chatId: string,
  userId: string,
  userRole: string | null,
): Promise<boolean> {
  const chat = await database
    .selectFrom("chats",)
    .select("created_by",)
    .where("id", "=", chatId,)
    .executeTakeFirst();
  return !!chat && (chat.created_by === userId || can(userRole, "admin.chat",));
}
