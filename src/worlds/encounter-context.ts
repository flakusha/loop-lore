// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/worlds/encounter-context.ts — the LLM context for one encounter
 *
 * Split from ./random-encounters.ts for the size gate.
 *
 * `recentEvents` is read through `listWorldEvents` from the world-discovery
 * module, which already owns the ordering contract for the event log (a
 * total order on tick_index descending, id ascending). A second query here
 * would drift from that contract and break page stability.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { discoveryDb, listWorldEvents, } from "../rpg/world-discovery";
import { jsonParseOr, } from "../utils";
import type { EncounterTemplate, } from "./encounter-types";

/** How many recent world events to pull into the context. */
export const DEFAULT_RECENT_EVENT_LIMIT = 10;

/** The location fields the GM needs to narrate an encounter in place. */
export interface EncounterLocation {
  id: string;
  name: string;
  /** Free-text description, when the world has one. */
  description?: string | null;
}

/** One world event as handed to the GM. */
export interface RecentEvent {
  event_type: string;
  subject_id: string | null;
  tick_index: number;
}

/** Everything the GM is told before narrating an encounter. */
export interface EncounterContext {
  worldId: string;
  /** Null-named placeholder when the roll had no location. */
  location: EncounterLocation;
  /** Newest tick first, capped at the requested limit. */
  recentEvents: RecentEvent[];
  /** The template's own story notes, verbatim; empty when unset. */
  storyNotes: string;
  /** The template's rewards and consequences, parsed from JSON columns. */
  rewards: Record<string, unknown>;
  consequences: Record<string, unknown>;
}

/** What `buildEncounterContext` needs. */
export interface BuildEncounterContextInput {
  /** Handle typed against the generated schema. */
  db: Kysely<DB>;
  /** World whose event log is read. */
  worldId: string;
  /** The fired template supplying notes, rewards and consequences. */
  template: EncounterTemplate;
  /** Location the encounter happens at; omitted when rolling without one. */
  location?: EncounterLocation;
  /** Cap on recent events; defaults to {@link DEFAULT_RECENT_EVENT_LIMIT}. */
  eventLimit?: number;
}

/** Placeholder used when a roll carries no location. */
const UNNAMED_LOCATION: EncounterLocation = { id: "", name: "an unnamed place", description: null, };

/**
 * Assemble the GM-facing context for one fired encounter.
 * @param db Kysely handle
 * @param worldId world whose event log is read
 * @param template the fired encounter template
 * @param location location the encounter happens at, when there is one
 * @param eventLimit cap on recent events
 * @returns the context block, with `recentEvents` newest-tick-first
 * @throws never — a world with no events yields an empty list, and a
 *   locationless roll yields the unnamed-location placeholder.
 */
export async function buildEncounterContext(
  { db, worldId, template, location, eventLimit, }: BuildEncounterContextInput,
): Promise<EncounterContext> {
  const limit = Math.max(1, eventLimit ?? DEFAULT_RECENT_EVENT_LIMIT,);
  const events = await listWorldEvents(discoveryDb(db,), { worldId, page: 1, pageSize: limit, },);

  return {
    worldId,
    location: location ?? UNNAMED_LOCATION,
    recentEvents: events.data.map((event,) => ({
      event_type: event.event_type,
      subject_id: event.subject_id,
      tick_index: event.tick_index,
    })),
    storyNotes: template.story_notes ?? "",
    rewards: jsonParseOr<Record<string, unknown>>(template.rewards, {},),
    consequences: jsonParseOr<Record<string, unknown>>(template.consequences, {},),
  };
}
