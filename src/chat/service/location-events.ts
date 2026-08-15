/**
 * Chat location events — append-only event log for location changes.
 *
 * Each row records a location transition in a chat: from where, to where,
 * what triggered it, and which message (if any) caused it.
 *
 * Enables travel-history replay for future chat re-reads / going back in
 * history. Without this log, `chats.current_location_id` is a lossy scalar
 * and previous locations are unrecoverable from DB state alone.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";

// ── Types ────────────────────────────────────────────────────

/** Who or what triggered the location change. */
export type LocationChangeSource = "auto" | "manual" | "migration";

/** Parameters to record a location change. */
export interface RecordLocationChangeParams {
  chatId: string;
  fromLocationId: string | null;
  toLocationId: string | null;
  source: LocationChangeSource;
  sectionId?: string | null;
  triggeringMessageId?: string | null;
}

// ── Record ────────────────────────────────────────────────────

/**
 * Append an immutable row to the location-change event log.
 *
 * @returns The inserted event id.
 */
export async function recordLocationChange(
  database: Kysely<DB>,
  params: RecordLocationChangeParams,
): Promise<string> {
  const id = crypto.randomUUID();

  await database
    .insertInto("chat_location_events",)
    .values({
      id,
      chat_id: params.chatId,
      section_id: params.sectionId ?? null,
      from_location_id: params.fromLocationId ?? null,
      to_location_id: params.toLocationId ?? null,
      triggering_message_id: params.triggeringMessageId ?? null,
      source: params.source,
      created_at: new Date().toISOString(),
    },)
    .execute();

  return id;
}

// ── Read ──────────────────────────────────────────────────────

/** A single location-change event row. */
export interface LocationEvent {
  id: string;
  chatId: string;
  sectionId: string | null;
  fromLocationId: string | null;
  toLocationId: string | null;
  triggeringMessageId: string | null;
  source: LocationChangeSource;
  createdAt: string;
}

/**
 * Get the full location-change history for a chat, oldest first.
 * Used by future chat re-read / history-navigation features.
 */
export async function getLocationHistory(
  database: Kysely<DB>,
  chatId: string,
): Promise<LocationEvent[]> {
  const rows = await database
    .selectFrom("chat_location_events",)
    .selectAll()
    .where("chat_id", "=", chatId,)
    .orderBy("created_at", "asc",)
    .execute();

  return Array.from(rows, (r,) => ({
    id: r.id,
    chatId: r.chat_id,
    sectionId: r.section_id,
    fromLocationId: r.from_location_id,
    toLocationId: r.to_location_id,
    triggeringMessageId: r.triggering_message_id,
    source: r.source as LocationChangeSource,
    createdAt: r.created_at,
  }),);
}
