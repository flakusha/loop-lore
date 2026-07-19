/**
 * Event Validation
 *
 * Validate extracted events against current world state.
 * Rejects events referencing unknown entities.
 */
import type { Kysely } from "kysely";
import { WorldEventType } from "../../db/enums";
import type { DB } from "../../db/schema";
import { assertNever } from "../../utils";
import type { WorldEvent } from "../types";

// ── Result Type ──────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  filteredEvents: WorldEvent[];
  rejections: string[];
}

// ── Options ──────────────────────────────────────────────────

export interface ValidateEventsOpts {
  db: Kysely<DB>;
  worldId: string;
  events: WorldEvent[];
}

// ── Validation ───────────────────────────────────────────────

function validateSingleEvent(
  event: WorldEvent,
  locationNames: Map<string, string>,
  locationIds: Set<string>,
): { valid: true } | { valid: false; reason: string } {
  switch (event.type) {
    case WorldEventType.LocationChange: {
      const targetName = (event.data.toLocationName as string | undefined)?.toLowerCase();
      if (targetName && locationNames.has(targetName)) {
        event.locationId = locationNames.get(targetName);
        return { valid: true };
      }
      return { valid: false, reason: `Unknown location: ${targetName}` };
    }
    case WorldEventType.CombatEvent:
    case WorldEventType.NpcStateChange:
    case WorldEventType.TimeAdvancement:
    case WorldEventType.WorldLoreUpdate:
    case WorldEventType.ItemTransfer:
    case WorldEventType.QuestProgress: {
      return { valid: true };
    }
    case WorldEventType.LocationModification: {
      const locId = event.data.locationId as string;
      if (locId && locationIds.has(locId)) {
        return { valid: true };
      }
      return { valid: false, reason: `Invalid location modification target: ${locId}` };
    }
    default: {
      return assertNever(event.type);
    }
  }
}

/** Validate extracted events against current world state */
export async function validateEvents({ db, worldId, events }: ValidateEventsOpts): Promise<ValidationResult> {
  const filteredEvents: WorldEvent[] = [];
  const rejections: string[] = [];

  const locations = await db
    .selectFrom("locations")
    .select(["id", "name"])
    .where("world_id", "=", worldId)
    .execute();

  const locationNames = new Map<string, string>();
  const locationIds = new Set<string>();
  for (const l of locations) {
    locationNames.set(l.name.toLowerCase(), l.id);
    locationIds.add(l.id);
  }

  for (const event of events) {
    const result = validateSingleEvent(event, locationNames, locationIds);
    if (result.valid) {
      filteredEvents.push(event);
    } else {
      rejections.push(result.reason);
    }
  }

  return { valid: rejections.length === 0, filteredEvents, rejections };
}
