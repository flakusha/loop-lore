// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat backgrounds — pure data helpers (assignment upsert, location auto-sync,
 * and background resolution). Shared between the route sub-plugins and external
 * consumers (`chats/extras.ts`, chat-backgrounds.test.ts).
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { uid, } from "../../utils";

/** Upsert the chat's assigned background to `backgroundId` (one per chat). */
export async function setChatBackground(
  database: Kysely<DB>,
  chatId: string,
  backgroundId: string,
): Promise<void> {
  const existing = await database
    .selectFrom("chat_background_assignments",)
    .select("id",)
    .where("chat_id", "=", chatId,)
    .executeTakeFirst();

  if (existing) {
    await database
      .updateTable("chat_background_assignments",)
      .set({ background_id: backgroundId, },)
      .where("id", "=", existing.id,)
      .execute();
  } else {
    await database
      .insertInto("chat_background_assignments",)
      .values({ id: uid(), chat_id: chatId, background_id: backgroundId, },)
      .execute();
  }
}

/**
 * Auto-sync a chat's background after its location changes.
 *
 * Resolution: the highest priority (lowest `priority` number) background whose
 * `location_id` matches the chat's new location wins; if none matches, the
 * current assignment is left untouched (a manually chosen global background).
 * Returns the resolved background row, or null when no location-scoped match.
 */
export async function autoSyncChatBackground(
  database: Kysely<DB>,
  chatId: string,
  locationId: string,
) {
  const match = await database
    .selectFrom("chat_backgrounds",)
    .selectAll()
    .where("location_id", "=", locationId,)
    .orderBy("priority", "asc",)
    .orderBy("created_at", "asc",)
    .executeTakeFirst();

  if (match) {
    await setChatBackground(database, chatId, match.id,);
  }
  return match ?? null;
}

/** Load a chat's resolved background (assignment joined to catalog) or null. */
export async function getChatBackground(
  database: Kysely<DB>,
  chatId: string,
) {
  const row = await database
    .selectFrom("chat_background_assignments",)
    .innerJoin("chat_backgrounds", "chat_backgrounds.id", "chat_background_assignments.background_id",)
    .selectAll("chat_backgrounds",)
    .where("chat_background_assignments.chat_id", "=", chatId,)
    .executeTakeFirst();
  return row ?? null;
}
