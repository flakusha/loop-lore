/**
 * Events Service
 *
 * Parse story events from LLM responses, validate against world state,
 * then apply mutations to NPC state, location state, world lore,
 * and item inventories.
 */
import type { Kysely, Transaction } from "kysely";
import type { DB } from "../db/schema";
import { WorldEventType } from "../db/enums";
import type { WorldEvent } from "./types";
import { ItemsService } from "./items";

// ── Event Extraction ─────────────────────────────────────────

/**
 * Extract structured events from a narrative message.
 * For v1, uses regex pattern matching and keyword analysis.
 * Future: delegate to a lightweight LLM for structured extraction.
 */
export function extractEvents(
  messageContent: string,
  actorId: string,
  currentLocationId: string | null,
): WorldEvent[] {
  const events: WorldEvent[] = [];
  const timestamp = new Date().toISOString();
  const lower = messageContent.toLowerCase();

  // Location change detection
  const locationPatterns = [
    /(?:enters?|moves?\s+to|arrives?\s+at|steps?\s+into|walks?\s+into|goes?\s+to|heads?\s+(?:to|toward)|leaves?\s+the)\s+[""']?([A-Za-z\s]+?)[""']?(?:[,.;!])/gi,
    /(?:makes?\s+(?:their\s+)?way\s+to(?:wards?)?|travels?\s+to|ventures?\s+into)\s+[""']?([A-Za-z\s]+?)[""']?(?:[,.;!])/gi,
  ];

  for (const pattern of locationPatterns) {
    const match = pattern.exec(messageContent);
    if (match && match[1]) {
      events.push({
        type: WorldEventType.LocationChange,
        actorId,
        locationId: currentLocationId ?? undefined,
        timestamp,
        data: {
          toLocationName: match[1].trim(),
          fromLocationId: currentLocationId,
          reason: "narrative",
        },
        description: `${actorId} moved to ${match[1].trim()}`,
      });
    }
  }

  // Time advancement detection
  const timePatterns = [
    /(?:hours?\s+(?:pass|go\s+by|elapse)|later\s+that\s+(?:day|night|evening|morning|afternoon)|(?:after|by)\s+(?:a\s+)?few\s+hours)/gi,
    /(?:the\s+(?:sun|moon)\s+(?:rises?|sets?)|dawn\s+(?:breaks?|approaches?)|dusk\s+(?:falls?|settles?)|night\s+(?:falls?|arrives?))/gi,
    /(?:the\s+next\s+(?:day|morning|evening)|a\s+(?:day|week|month)\s+later)/gi,
  ];

  for (const pattern of timePatterns) {
    if (pattern.test(messageContent)) {
      events.push({
        type: WorldEventType.TimeAdvancement,
        actorId,
        timestamp,
        data: {
          minutesAdvanced: 120, // ~2 hours default; refine with NLP later
          newTimeOfDay: "unknown",
          reason: "narrative time skip",
        },
        description: "Time advanced in the narrative",
      });
      break;
    }
  }

  // Combat detection
  const combatPatterns = [
    /(?:strikes?|hits?|slashes?|stabs?|shoots?|fires?\s+(?:at|upon)|attacks?|battles?|fights?|wounds?|injures?)/gi,
    /(?:takes?\s+\d+\s+(?:damage|hits?)|loses?\s+\d+\s+hp|health\s+(?:drops?|falls?)\s+to\s+\d+)/gi,
  ];

  for (const pattern of combatPatterns) {
    if (pattern.test(messageContent)) {
      events.push({
        type: WorldEventType.CombatEvent,
        actorId,
        timestamp,
        data: {
          attackerId: actorId,
          defenderId: "unknown",
          damage: 0,
          damageType: "physical",
          statusEffects: [],
          defeated: lower.includes("defeated") || lower.includes("killed") || lower.includes("slain"),
        },
        description: "Combat occurred in the narrative",
      });
      break;
    }
  }

  // NPC state change detection
  const npcPatterns = [
    /(?:looks?\s+(?:calm|afraid|angry|suspicious|friendly|worried|happy|sad|confused|determined))/gi,
    /(?:becomes?\s+(?:more|less)\s+(?:friendly|hostile|suspicious|trusting))/gi,
    /(?:reveals?|tells?\s+|confesses?|shares?|admits?)\s+(?:that\s+)?(?:he|she|they)\s+(?:knows?|has|found|discovered)/gi,
  ];

  for (const pattern of npcPatterns) {
    if (pattern.test(messageContent)) {
      events.push({
        type: WorldEventType.NpcStateChange,
        actorId,
        timestamp,
        data: {
          npcActorId: actorId,
          changes: { mental_state: "changed" },
        },
        description: "NPC state changed",
      });
      break;
    }
  }

  // Item transfer detection
  const itemPatterns = [
    /(?:gives?|hands?|offers?|passes?|trades?)\s+(?:the\s+|a\s+|an\s+)?[""']?([A-Za-z\s]+?)[""']?\s+(?:to\s+|for\s+)/gi,
    /(?:takes?|picks?\s+up|grabs?|collects?|acquires?|receives?|finds?)\s+(?:the\s+|a\s+|an\s+)?[""']?([A-Za-z\s]+?)[""']?/gi,
    /(?:drops?|leaves?\s+behind|abandons?|puts?\s+down)\s+(?:the\s+|a\s+|an\s+)?[""']?([A-Za-z\s]+?)[""']?/gi,
  ];

  for (const pattern of itemPatterns) {
    const match = pattern.exec(messageContent);
    if (match && match[1]) {
      events.push({
        type: WorldEventType.ItemTransfer,
        actorId,
        timestamp,
        data: {
          fromActorId: null,
          toActorId: match[0].toLowerCase().includes("drops") || match[0].toLowerCase().includes("leaves") ? null : actorId,
          itemName: match[1].trim(),
          quantity: 1,
        },
        description: `Item interaction: ${match[1].trim()}`,
      });
    }
  }

  // Lore update detection (new facts about the world revealed)
  const lorePatterns = [
    /(?:reveals?\s+that|discover(?:s|ed)\s+that|learn(?:s|ed)\s+that|uncovers?|unearth(?:s|ed)|realiz(?:es?|ed)\s+that)/gi,
    /(?:according\s+to\s+(?:legend|ancient|old)\s+(?:texts?|records?|tales?|scrolls?))/gi,
  ];

  for (const pattern of lorePatterns) {
    if (pattern.test(messageContent)) {
      // Extract the sentence containing the lore
      const sentences = messageContent.split(/[.!?]+/);
      const loreSentence = sentences.find((s) => pattern.test(s));
      if (loreSentence) {
        events.push({
          type: WorldEventType.WorldLoreUpdate,
          actorId,
          timestamp,
          data: {
            newLoreEntry: loreSentence.trim(),
            category: "narrative_revelation",
            confidence: 0.5,
          },
          description: "New world lore revealed",
        });
      }
      break;
    }
  }

  return events;
}

// ── Event Validation ─────────────────────────────────────────

export interface ValidationResult {
  valid: boolean;
  filteredEvents: WorldEvent[];
  rejections: string[];
}

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

// ── Event Application ────────────────────────────────────────

export interface AppliedEvent {
  event: WorldEvent;
  applied: boolean;
  error?: string;
}

/** Apply validated events to the DB */
export async function applyEvents(
  db: Kysely<DB>,
  worldId: string,
  events: WorldEvent[],
  trx?: Transaction<DB>,
): Promise<AppliedEvent[]> {
  const database = trx ?? db;
  const results: AppliedEvent[] = [];
  const items = new ItemsService(database);

  for (const event of events) {
    try {
      switch (event.type) {
        case WorldEventType.LocationChange:
          await applyLocationChange(database, event);
          results.push({ event, applied: true });
          break;
        case WorldEventType.NpcStateChange:
          await applyNpcStateChange(database, event);
          results.push({ event, applied: true });
          break;
        case WorldEventType.TimeAdvancement:
          await applyTimeAdvancement(database, worldId, event);
          results.push({ event, applied: true });
          break;
        case WorldEventType.LocationModification:
          await applyLocationModification(database, event);
          results.push({ event, applied: true });
          break;
        case WorldEventType.WorldLoreUpdate:
          await applyWorldLoreUpdate(database, worldId, event);
          results.push({ event, applied: true });
          break;
        case WorldEventType.CombatEvent:
          await applyCombatEvent(database, event);
          results.push({ event, applied: true });
          break;
        case WorldEventType.ItemTransfer:
          await applyItemTransfer(items, worldId, event);
          results.push({ event, applied: true });
          break;
        default:
          results.push({ event, applied: false, error: `Unknown event type: ${event.type}` });
      }
    } catch (error) {
      results.push({
        event,
        applied: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return results;
}

// ── Individual Event Handlers ────────────────────────────────

async function applyLocationChange(db: Kysely<DB>, event: WorldEvent): Promise<void> {
  if (!event.locationId) return;

  // Update NPC or actor location in NPC states
  if (event.actorId) {
    await db
      .updateTable("npc_states")
      .set({ location_id: event.locationId })
      .where("actor_id", "=", event.actorId)
      .execute();
  }
}

async function applyNpcStateChange(db: Kysely<DB>, event: WorldEvent): Promise<void> {
  const npcActorId = (event.data.npcActorId ?? event.actorId) as string;
  if (!npcActorId) return;

  const changes = event.data.changes as Partial<Record<string, unknown>>;

  const update: Record<string, unknown> = {};
  if (changes.health !== undefined) update.health = changes.health;
  if (changes.mental_state) update.mental_state = changes.mental_state;
  if (changes.relationships) update.relationships = JSON.stringify(changes.relationships);
  if (changes.knowledge) update.knowledge = JSON.stringify(changes.knowledge);
  if (Object.keys(update).length > 0) {
    update.updated_at = new Date().toISOString();
    await db.updateTable("npc_states").set(update).where("actor_id", "=", npcActorId).execute();
  }
}

async function applyTimeAdvancement(db: Kysely<DB>, worldId: string, event: WorldEvent): Promise<void> {
  const minutes = (event.data.minutesAdvanced ?? 60) as number;

  // Update time in all location states for this world
  const locationStates = await db
    .selectFrom("location_states")
    .select(["id", "location_id", "time_of_day"])
    .where("world_id", "=", worldId)
    .execute();

  for (const state of locationStates) {
    const newTime = advanceTimeOfDay(state.time_of_day ?? "morning", minutes);
    await db
      .updateTable("location_states")
      .set({ time_of_day: newTime })
      .where("id", "=", state.id)
      .execute();
  }
}

function advanceTimeOfDay(current: string, minutes: number): string {
  const order = ["morning", "afternoon", "evening", "night"];
  const idx = order.indexOf(current);
  if (idx === -1) return "morning";
  const advanceSteps = Math.floor(minutes / 180); // ~3 hours per step
  return order[(idx + advanceSteps) % order.length];
}

async function applyLocationModification(db: Kysely<DB>, event: WorldEvent): Promise<void> {
  const locationId = (event.data.locationId ?? event.locationId) as string;
  if (!locationId) return;

  const changes = event.data.changes as Partial<Record<string, unknown>>;
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (changes.description_override) update.description_override = changes.description_override;
  if (changes.atmosphere) update.atmosphere = changes.atmosphere;
  if (changes.weather) update.weather = changes.weather;
  if (changes.hazards) update.hazards = JSON.stringify(changes.hazards);

  await db.updateTable("location_states").set(update).where("location_id", "=", locationId).execute();
}

async function applyWorldLoreUpdate(db: Kysely<DB>, worldId: string, event: WorldEvent): Promise<void> {
  const entry = event.data.newLoreEntry as string;
  if (!entry) return;

  // Append new lore to world's lore field
  const world = await db
    .selectFrom("worlds")
    .select("lore")
    .where("id", "=", worldId)
    .executeTakeFirst();

  if (world) {
    const existingLore = world.lore ?? "";
    const newLore = existingLore
      ? `${existingLore}\n\n### ${new Date().toLocaleDateString()}\n${entry}`
      : `### ${new Date().toLocaleDateString()}\n${entry}`;

    await db.updateTable("worlds").set({ lore: newLore }).where("id", "=", worldId).execute();
  }
}

async function applyCombatEvent(db: Kysely<DB>, event: WorldEvent): Promise<void> {
  const defenderId = (event.data.defenderId ?? event.actorId) as string;
  const damage = (event.data.damage ?? 10) as number;
  const defeated = (event.data.defeated ?? false) as boolean;

  if (defenderId) {
    const npc = await db
      .selectFrom("npc_states")
      .select("health")
      .where("actor_id", "=", defenderId)
      .executeTakeFirst();

    if (npc) {
      const newHealth = defeated ? 0 : Math.max(0, npc.health - damage);
      await db
        .updateTable("npc_states")
        .set({ health: newHealth, mental_state: newHealth <= 0 ? "defeated" : "hostile" })
        .where("actor_id", "=", defenderId)
        .execute();
    }
  }
}

async function applyItemTransfer(itemsService: ItemsService, worldId: string, event: WorldEvent): Promise<void> {
  // For v1: just log the transfer. Actual item resolution requires
  // matching item names to definitions, which needs LLM-assisted matching.
  // This placeholder ensures the event is recorded without error.
}