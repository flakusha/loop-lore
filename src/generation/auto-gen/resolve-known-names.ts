// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
/**
 * Helper: derive the chat-scoped set of known entity names for
 * hallucination-guard's `knownEntityNames` pathway.
 *
 * Resolves participant display names + the current chat location name so
 * `detectHallucinations` does not flag participants or locations as
 * hallucinations. This is the lowest-friction wiring path: it reuses the
 * already-existing `knownEntityNames` slot on `HallucinationCheckOpts`
 * rather than populating the unused `_knownActorIds` / `_knownLocationIds`
 * stubs in `isKnownEntity`.
 *
 * Reads:
 * - chat_participants → actors.display_name (every participant)
 * - chats.current_location_id → locations.name
 *
 * Errors (DB down, missing rows) are swallowed and an empty array is
 * returned — better to over-flag than to crash the generation pipeline.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { loadChatLocation, loadChatParticipants, } from "./random-event-context";

/**
 * Resolve the chat-scoped set of known entity names (participants +
 * current location) for hallucination-guard.
 *
 * Returns distinct, non-empty display names. Order is not significant —
 * `detectHallucinations` lowercases and Set-checks.
 * @param database Kysely handle.
 * @param chatId Chat whose participants and location are in scope.
 * @returns Array of known display names (may be empty).
 */
export async function resolveChatKnownEntityNames(
  database: Kysely<DB>,
  chatId: string,
): Promise<string[]> {
  try {
    const [participantsResult, locationRow,] = await Promise.allSettled([
      loadChatParticipants(database, chatId,),
      database
        .selectFrom("chats",)
        .select("current_location_id",)
        .where("id", "=", chatId,)
        .executeTakeFirst()
        .then((row,) => loadChatLocation(database, row?.current_location_id ?? null,)),
    ],);
    const participants = participantsResult.status === "fulfilled" ? participantsResult.value : [];
    const names = new Set<string>();
    for (const p of participants) {
      const trimmed = p.displayName.trim();
      if (trimmed) { names.add(trimmed,); }
    }
    if (locationRow) {
      const trimmed = locationRow.name.trim();
      if (trimmed) { names.add(trimmed,); }
    }
    return Array.from(names,);
  } catch {
    return [];
  }
}
