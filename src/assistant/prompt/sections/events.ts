/**
 * Event injection section — injects active world events and random
 * ambient events into the chat context to keep scenes alive.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { safeJsonParse, } from "../../../utils";
import { wrapSection, } from "../../xml-utils";
import type { SectionBuilder, } from "../types";

/** An event to inject into the prompt. */
interface ChatEvent {
  type: "world" | "ambient" | "location";
  content: string;
  importance: number;
}

/**
 * Fetch active world events for the current location/world.
 */
async function fetchWorldEvents(
  db: Kysely<DB>,
  worldId: string,
  locationId: string | null,
): Promise<ChatEvent[]> {
  const events: ChatEvent[] = [];

  // Fetch recent world states as events
  const worldStates = await db
    .selectFrom("world_states",)
    .select(["description", "created_at",],)
    .where("world_id", "=", worldId,)
    .orderBy("created_at", "desc",)
    .limit(3,)
    .execute();

  for (const state of worldStates) {
    if (state.description) {
      events.push({
        type: "world",
        content: state.description,
        importance: 0.6,
      },);
    }
  }

  // Fetch location states if location is set
  if (locationId) {
    const locStates = await db
      .selectFrom("location_states",)
      .select(["description_override", "atmosphere", "weather", "npcs_present",],)
      .where("location_id", "=", locationId,)
      .orderBy("created_at", "desc",)
      .limit(1,)
      .execute();

    for (const loc of locStates) {
      const parts: string[] = [];
      if (loc.description_override) { parts.push(loc.description_override,); }
      if (loc.atmosphere) { parts.push(`Atmosphere: ${loc.atmosphere}`,); }
      if (loc.weather) { parts.push(`Weather: ${loc.weather}`,); }

      const npcs = safeJsonParse<string[]>(loc.npcs_present ?? "[]",);
      if (npcs.ok && npcs.value.length > 0) {
        parts.push(`Present: ${npcs.value.join(", ",)}`,);
      }

      if (parts.length > 0) {
        events.push({
          type: "location",
          content: parts.join(". ",),
          importance: 0.7,
        },);
      }
    }
  }

  return events;
}

/**
 * Generate ambient micro-events for atmosphere.
 *
 * These are low-stakes stochastic additions that make the world feel alive
 * without requiring GM intervention. Examples: wind sounds, distant
 * footsteps, flickering lights, ambient smells.
 */
function generateAmbientEvents(worldId: string,): ChatEvent[] {
  const ambientPool: ChatEvent[] = [
    { type: "ambient", content: "A gentle breeze rustles through the area.", importance: 0.2, },
    { type: "ambient", content: "Distant sounds echo faintly in the background.", importance: 0.2, },
    { type: "ambient", content: "The light shifts subtly, casting new shadows.", importance: 0.2, },
    { type: "ambient", content: "A faint scent drifts on the air.", importance: 0.2, },
    { type: "ambient", content: "The ground trembles almost imperceptibly.", importance: 0.2, },
    { type: "ambient", content: "A bird calls somewhere in the distance.", importance: 0.2, },
  ];

  // Use worldId as a simple seed for deterministic selection
  let seed = 0;
  for (const c of worldId.split("",)) { seed += c.charCodeAt(0,); }
  const idx = seed % ambientPool.length;
  return [ambientPool[idx]!,];
}

export const eventSection: SectionBuilder = {
  name: "events",
  enabled: (ctx,) => !!ctx.chat.world_id,
  build: async (ctx,) => {
    if (!ctx.chat.world_id) { return []; }

    const worldEvents = await fetchWorldEvents(
      ctx.db,
      ctx.chat.world_id,
      ctx.chat.current_location_id,
    );

    // Add ambient events (1-2 random atmospheric additions)
    const ambientEvents = generateAmbientEvents(ctx.chat.world_id,);

    const allEvents = [...worldEvents, ...ambientEvents,];
    if (allEvents.length === 0) { return []; }

    // Sort by importance descending, take top 5
    allEvents.sort((a, b,) => b.importance - a.importance);
    const topEvents = allEvents.slice(0, 5,);

    const eventText = Array.from(topEvents, (e,) => `- [${e.type}] ${e.content}`,).join("\n",);

    return [{ role: "system", content: wrapSection("events", eventText,), },];
  },
};
