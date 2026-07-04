/**
 * Event Validation
 *
 * Validate extracted events against current world state.
 * Rejects events referencing unknown entities.
 */
import type { Kysely } from "kysely";
import type { DB } from "../../db/schema";
import { WorldEventType } from "../../db/enums";
import type { WorldEvent } from "../types";

// ── Result Type ──────────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  filteredEvents: WorldEvent[];
  rejections: string[];
}

// ── Validation ───────────────────────────────────────────────

/** Validate extracted events against current world state */
export async function validateEvents(
  db: Kysely<DB>,
  worldId: string,
  events: WorldEvent[],
): Promise<ValidationResult> {
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
    switch (event.type) {
      case WorldEventType.LocationChange: {
        const targetName = (event.data.toLocationName as string | undefined)?.toLowerCase();
        if (targetName && locationNames.has(targetName)) {
          event.locationId = locationNames.get(targetName);
          filteredEvents.push(event);
        } else {
          rejections.push(`Unknown location: ${targetName}`);
        }
        break;
      }
      case WorldEventType.CombatEvent:
      case WorldEventType.NpcStateChange:
      case WorldEventType.TimeAdvancement:
      case WorldEventType.WorldLoreUpdate:
        filteredEvents.push(event);
        break;
      case WorldEventType.ItemTransfer: {
        // Item transfers are always valid (may create new item instances)
        filteredEvents.push(event);
        break;
      }
      case WorldEventType.LocationModification: {
        const locId = event.data.locationId as string;
        if (locId && locationIds.has(locId)) {
          filteredEvents.push(event);
        } else {
          rejections.push(`Invalid location modification target: ${locId}`);
        }
        break;
      }
      case WorldEventType.QuestProgress:
        filteredEvents.push(event);
        break;
      default:
        filteredEvents.push(event);
    }
  }

  return { valid: rejections.length === 0, filteredEvents, rejections };
}
