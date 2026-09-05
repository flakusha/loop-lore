// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
/**
 * Helpers for building the random-event context (participants + current
 * location) used by `applyPostStoreEffects`. Extracted from `post-store.ts`
 * to satisfy the file-size gate (250L).
 */
import type { Kysely, } from "kysely";
import type { RandomEventLocation, RandomEventParticipant, } from "../../chat/random-events";
import type { DB, } from "../../db/schema";

/**
 * Load chat participants for random-event `{npc}` substitution.
 * Maps `actor_type` → random-event `role` (`"ai"` for characters, `"user"` for everyone else).
 * @param database
 * @param chatId
 */
export async function loadChatParticipants(
  database: Kysely<DB>,
  chatId: string,
): Promise<RandomEventParticipant[]> {
  const rows = await database
    .selectFrom("chat_participants",)
    .innerJoin("actors", "actors.id", "chat_participants.actor_id",)
    .select(["actors.id", "actors.display_name", "actors.actor_type",],)
    .where("chat_participants.chat_id", "=", chatId,)
    .execute();

  return Array.from(rows, (r,) => ({
    displayName: r.display_name,
    id: r.id,
    role: r.actor_type === "character" ? "ai" : "user",
  }),);
}

/**
 * Load the chat's current location for random-event `{location}` substitution.
 * Returns `null` if the chat has no current location or the location row is missing.
 * @param database
 * @param locationId
 */
export async function loadChatLocation(
  database: Kysely<DB>,
  locationId: string | null,
): Promise<RandomEventLocation | null> {
  if (!locationId) { return null; }
  const row = await database
    .selectFrom("locations",)
    .select(["id", "name", "description",],)
    .where("id", "=", locationId,)
    .executeTakeFirst();
  if (!row) { return null; }
  return {
    description: row.description ?? undefined,
    id: row.id,
    name: row.name,
  };
}
