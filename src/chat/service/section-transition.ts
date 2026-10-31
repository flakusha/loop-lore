// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Section transitions for multi-location chats.
 *
 * A manual location change (`POST /chats/:id/transfer`, `PUT /chats/:id/location`)
 * must leave the chat's journey sections consistent with its new location: the
 * destination gets a section bound to it, so the chat keeps spanning multiple
 * locations the same way the narration-detected path
 * (`handle-scene-transitions.ts`) already does.
 *
 * Consecutive re-transfers to the location the latest section already covers
 * are a no-op — walking out of the tavern and back creates Forest, Tavern
 * sections; transferring to the tavern again must not duplicate it.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";

/** Parameters to ensure a section exists for a location. */
export interface EnsureSectionParams {
  chatId: string;
  locationId: string;
  /** Section label; falls back to a shortened-location placeholder. */
  label?: string | null;
}

/**
 * Append a section bound to the given location unless the chat's latest
 * section already covers it. Intended to run inside the same transaction as
 * the location update and event insert, so all three land atomically.
 * @param database
 * @param params
 * @returns The section id, or null when the latest section already covers the
 * location and no row was created.
 * @throws Propagates Kysely insert errors on transaction failure.
 */
export async function ensureSectionForLocation(
  database: Kysely<DB>,
  params: EnsureSectionParams,
): Promise<string | null> {
  const latest = await database
    .selectFrom("chat_sections",)
    .select(["id", "location_id",],)
    .where("chat_id", "=", params.chatId,)
    .orderBy("sort_index", "desc",)
    .limit(1,)
    .executeTakeFirst();

  if (latest?.location_id === params.locationId) { return null; }

  const maxIndex = await database
    .selectFrom("chat_sections",)
    .select(database.fn.max<number>("sort_index",).as("max",),)
    .where("chat_id", "=", params.chatId,)
    .executeTakeFirst();

  const id = crypto.randomUUID();
  await database
    .insertInto("chat_sections",)
    .values({
      id,
      chat_id: params.chatId,
      label: params.label ?? `Location ${params.locationId.slice(0, 8,)}`,
      location_id: params.locationId,
      sort_index: (maxIndex?.max ?? 0) + 1,
    },)
    .execute();

  return id;
}
