// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Travel Prompts section — bound/linked travel mode.
 *
 * When enabled (`assistant.travelPrompts`), instructs the LLM that it may
 * narrate travel and suggests moving the chat to another location/chat when
 * the narrative leaves the current one. Suggestions may reference only known
 * world locations (from the `locations` table) — never fabricated places.
 *
 * The user-facing side (in-chat location change / new chat / join) is provided
 * by the location panel; this section is the LLM-side counterpart.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { wrapSection, } from "../../xml-utils";
import type { SectionBuilder, } from "../types";

const MAX_LOCATION_HINTS = 12;

/** Known world location names (id + name) for travel references. */
async function knownLocations(
  db: Kysely<DB>,
  worldId: string,
  excludeLocationId: string | null,
): Promise<{ id: string; name: string }[]> {
  return await db
    .selectFrom("locations",)
    .select(["id", "name",],)
    .where("world_id", "=", worldId,)
    .$if(!!excludeLocationId, (qb,) => qb.where("id", "!=", excludeLocationId as string,),)
    .orderBy("name", "asc",)
    .limit(MAX_LOCATION_HINTS,)
    .execute();
}

export const travelSection: SectionBuilder = {
  name: "travelPrompts",
  enabled: (ctx,) => ctx.config?.assistant?.travelPrompts === true && !!ctx.chat.world_id,
  build: async (ctx,) => {
    const worldId = ctx.chat.world_id!;
    const places = await knownLocations(ctx.db, worldId, ctx.chat.current_location_id,);

    const placeNames = Array.from(places, (place,) => place.name,);
    const lines = [
      "Travel is possible in this world. You may narrate characters moving between locations.",
      "When the narrative leaves the current location, you may suggest continuing in another location or chat (bound/linked travel).",
      `Known locations in this world: ${placeNames.join(", ",) || "(none listed)"}.`,
      "Reference only locations from this list — never invent or name places that do not exist in the world.",
      "When a character departs, state the destination plainly so travel can be tracked.",
    ];

    return [{ role: "system", content: wrapSection("travelPrompts", lines.join("\n",),), },];
  },
};
