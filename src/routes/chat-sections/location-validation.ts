// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Location validation for chat sections.
 *
 * Sections tie to distinct locations of the chat's world: a locationId must
 * reference an existing location of that world, matching the invariant the
 * transfer / `PUT /chats/:id/location` endpoints already enforce. Without
 * this check, section create/update could bind sections to foreign-world or
 * nonexistent locations and silently break location-driven behavior
 * (dividers, background sync, avatar resolution).
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { HttpStatus, jsonError, notFoundResponse as notFound, } from "../http-utils";

/** Chat columns the validator needs. */
export interface SectionChatRef {
  world_id: string | null;
}

/** Successful resolution: the validated location row. */
export interface ValidSectionLocation {
  ok: true;
  location: { id: string; name: string | null };
}

/** Failed validation: the error response to return to the client. */
export interface InvalidSectionLocation {
  ok: false;
  response: Response;
}

/**
 * Validate that a location may be bound to a section of this chat: the chat
 * must have a world, and the location must exist in that world.
 * @param database
 * @param chat Chat row providing `world_id`.
 * @param locationId Non-empty location id from the request body.
 * @returns Discriminated union — the location row, or the error Response.
 */
export async function validateSectionLocation(
  database: Kysely<DB>,
  chat: SectionChatRef,
  locationId: string,
): Promise<ValidSectionLocation | InvalidSectionLocation> {
  if (!chat.world_id) {
    return {
      ok: false,
      response: jsonError({
        message: "Chat has no world assigned",
        status: HttpStatus.BadRequest,
      },),
    };
  }

  const location = await database
    .selectFrom("locations",)
    .select(["id", "name",],)
    .where("id", "=", locationId,)
    .where("world_id", "=", chat.world_id,)
    .executeTakeFirst();

  if (!location) {
    return { ok: false, response: notFound("Location not found in this world",), };
  }

  return { ok: true, location, };
}
