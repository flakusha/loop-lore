// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
/**
 * Random ambient event firing for the post-store step.
 *
 * Counts chat messages (cooldown tracking), looks up chat participants and
 * current location for `{npc}` / `{location}` / `{weather}` substitution,
 * generates a candidate event, and persists it into `chat_random_events` so
 * the next prompt build's event section can inject it into the context
 * window.
 *
 * Extracted from post-store.ts so that file stays under the size ceiling and
 * the event branch stays a single cohesive unit.
 */
import { type Kysely, sql, } from "kysely";
import { generateRandomEvent, type RandomEvent, } from "../../chat";
import { randomEventToEventRef, } from "../../chat/random-events";
import type { EventRef, } from "../../chat/types/context";
import type { DB, } from "../../db/schema";
import { loadChatLocation, loadChatParticipants, } from "./random-event-context";

/**
 * Fire a random ambient event for the chat and persist it.
 *
 * Returns the fired event (and its EventRef) when one was generated, or null
 * when no event was eligible. Persistence failure is reported to the caller;
 * the caller decides whether the failure is fatal.
 * @param database
 * @param chatId
 */
export async function fireRandomEvent(
  database: Kysely<DB>,
  chatId: string,
): Promise<{ event: RandomEvent; eventRef: EventRef } | null> {
  // Count messages for cooldown tracking.
  const msgCount = await database
    .selectFrom("messages",)
    .select(database.fn.count("id",).as("cnt",),)
    .where("chat_id", "=", chatId,)
    .executeTakeFirst();

  // Look up the current location for substitution context.
  const chatRow = await database
    .selectFrom("chats",)
    .select(["current_location_id",],)
    .where("id", "=", chatId,)
    .executeTakeFirst();

  const participants = await loadChatParticipants(database, chatId,);
  const location = await loadChatLocation(database, chatRow?.current_location_id ?? null,);

  const event = generateRandomEvent({
    currentLocation: location ?? undefined,
    messageCount: Number(msgCount?.cnt ?? 0,),
    participants,
  },);

  if (!event) { return null; }

  const eventRef = randomEventToEventRef(event,);
  const now = Date.now();

  // Persist the fired event so the next prompt build can inject it into the
  // context window (eventSection reads chat_random_events). Keep it
  // injectable for one day; expiry bounds how long stale events linger.
  await database
    .insertInto("chat_random_events",)
    .values({
      chat_id: chatId,
      content: event.content,
      event_id: event.id,
      category: event.category,
      fired_at: now,
      expires_at: now + 24 * 60 * 60 * 1000,
      token_count: eventRef.tokenCount,
    },)
    .onConflict((oc,) =>
      oc.columns(["chat_id", "event_id",],).doUpdateSet({
        content: event.content,
        fired_at: now,
        expires_at: now + 24 * 60 * 60 * 1000,
        token_count: eventRef.tokenCount,
        fired_count: sql`fired_count + 1`,
      },)
    )
    .execute();

  return { event, eventRef, };
}
