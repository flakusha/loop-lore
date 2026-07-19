/**
 * Event Application
 *
 * Apply validated world events to the database.
 * Each event type has a dedicated handler.
 */
import type { Kysely, Transaction, } from "kysely";
import { WorldEventType, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { assertNever, safeJsonStringify, } from "../../utils";
import { ItemsService, } from "../items";
import type { WorldEvent, } from "../types";

// ── Result Type ──────────────────────────────────────────────

export interface AppliedEvent {
  event: WorldEvent;
  applied: boolean;
  error?: string;
}

// ── Options ──────────────────────────────────────────────────

export interface ApplyEventsOpts {
  db: Kysely<DB>;
  worldId: string;
  events: WorldEvent[];
  trx?: Transaction<DB>;
}

// ── Apply Events ─────────────────────────────────────────────

async function applySingleEvent(
  database: Kysely<DB>,
  worldId: string,
  items: ItemsService,
  event: WorldEvent,
): Promise<AppliedEvent> {
  switch (event.type) {
    case WorldEventType.LocationChange: {
      await applyLocationChange(database, event,);
      return { event, applied: true, };
    }
    case WorldEventType.NpcStateChange: {
      await applyNpcStateChange(database, event,);
      return { event, applied: true, };
    }
    case WorldEventType.TimeAdvancement: {
      await applyTimeAdvancement(database, worldId, event,);
      return { event, applied: true, };
    }
    case WorldEventType.LocationModification: {
      await applyLocationModification(database, event,);
      return { event, applied: true, };
    }
    case WorldEventType.WorldLoreUpdate: {
      await applyWorldLoreUpdate(database, worldId, event,);
      return { event, applied: true, };
    }
    case WorldEventType.CombatEvent: {
      await applyCombatEvent(database, event,);
      return { event, applied: true, };
    }
    case WorldEventType.ItemTransfer: {
      await applyItemTransfer(items, worldId, event,);
      return { event, applied: true, };
    }
    case WorldEventType.QuestProgress: {
      // Quest progress is handled by QuestEngine, not here
      return { event, applied: true, };
    }
    default: {
      return assertNever(event.type,);
    }
  }
}

/** Apply validated events to the DB */
export async function applyEvents({ db, worldId, events, trx, }: ApplyEventsOpts,): Promise<AppliedEvent[]> {
  const database = trx ?? db;
  const results: AppliedEvent[] = [];
  const items = new ItemsService(database,);

  for (const event of events) {
    try {
      results.push(await applySingleEvent(database, worldId, items, event,),);
    } catch (error) {
      results.push({
        event,
        applied: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },);
    }
  }

  return results;
}

// ── Individual Event Handlers ────────────────────────────────

async function applyLocationChange(db: Kysely<DB>, event: WorldEvent,): Promise<void> {
  if (!event.locationId) { return; }

  // Update NPC or actor location in NPC states
  if (event.actorId) {
    await db
      .updateTable("npc_states",)
      .set({ location_id: event.locationId, },)
      .where("actor_id", "=", event.actorId,)
      .execute();
  }
}

async function applyNpcStateChange(db: Kysely<DB>, event: WorldEvent,): Promise<void> {
  const npcActorId = (event.data.npcActorId ?? event.actorId) as string;
  if (!npcActorId) { return; }

  const changes = event.data.changes as Partial<Record<string, unknown>>;

  const update: Record<string, unknown> = {};
  if (changes.health != null) { update.health = changes.health; }
  if (changes.mental_state) { update.mental_state = changes.mental_state; }
  if (changes.relationships) {
    const r = safeJsonStringify(changes.relationships,);
    if (r.ok) { update.relationships = r.value; }
  }
  if (changes.knowledge) {
    const r = safeJsonStringify(changes.knowledge,);
    if (r.ok) { update.knowledge = r.value; }
  }
  if (Object.keys(update,).length > 0) {
    update.updated_at = new Date().toISOString();
    await db.updateTable("npc_states",).set(update,).where("actor_id", "=", npcActorId,).execute();
  }
}

async function applyTimeAdvancement(db: Kysely<DB>, worldId: string, event: WorldEvent,): Promise<void> {
  const minutes = (event.data.minutesAdvanced ?? 60) as number;

  // Update time in all location states for this world
  const locationStates = await db
    .selectFrom("location_states",)
    .select(["id", "location_id", "time_of_day",],)
    .where("world_id", "=", worldId,)
    .execute();

  for (const state of locationStates) {
    const newTime = advanceTimeOfDay(state.time_of_day ?? "morning", minutes,);
    await db
      .updateTable("location_states",)
      .set({ time_of_day: newTime, },)
      .where("id", "=", state.id,)
      .execute();
  }
}

function advanceTimeOfDay(current: string, minutes: number,): string {
  const order = ["morning", "afternoon", "evening", "night",];
  const idx = order.indexOf(current,);
  if (idx === -1) { return "morning"; }
  const advanceSteps = Math.floor(minutes / 180,); // ~3 hours per step
  return order[(idx + advanceSteps) % order.length]!;
}

async function applyLocationModification(db: Kysely<DB>, event: WorldEvent,): Promise<void> {
  const locationId = (event.data.locationId ?? event.locationId) as string;
  if (!locationId) { return; }

  const changes = event.data.changes as Partial<Record<string, unknown>>;
  const update: Record<string, unknown> = { updated_at: new Date().toISOString(), };

  if (changes.description_override) { update.description_override = changes.description_override; }
  if (changes.atmosphere) { update.atmosphere = changes.atmosphere; }
  if (changes.weather) { update.weather = changes.weather; }
  if (changes.hazards) {
    const r = safeJsonStringify(changes.hazards,);
    if (r.ok) { update.hazards = r.value; }
  }

  await db.updateTable("location_states",).set(update,).where("location_id", "=", locationId,).execute();
}

async function applyWorldLoreUpdate(db: Kysely<DB>, worldId: string, event: WorldEvent,): Promise<void> {
  const entry = event.data.newLoreEntry as string;
  if (!entry) { return; }

  // Append new lore to world's lore field
  const world = await db.selectFrom("worlds",).select("lore",).where("id", "=", worldId,).executeTakeFirst();

  if (world) {
    const existingLore = world.lore ?? "";
    const newLore = existingLore
      ? `${existingLore}\n\n### ${new Date().toLocaleDateString()}\n${entry}`
      : `### ${new Date().toLocaleDateString()}\n${entry}`;

    await db.updateTable("worlds",).set({ lore: newLore, },).where("id", "=", worldId,).execute();
  }
}

async function applyCombatEvent(db: Kysely<DB>, event: WorldEvent,): Promise<void> {
  const defenderId = (event.data.defenderId ?? event.actorId) as string;
  const damage = (event.data.damage ?? 10) as number;
  const defeated = (event.data.defeated ?? false) as boolean;

  if (defenderId) {
    const npc = await db
      .selectFrom("npc_states",)
      .select("health",)
      .where("actor_id", "=", defenderId,)
      .executeTakeFirst();

    if (npc) {
      const newHealth = defeated ? 0 : Math.max(0, npc.health - damage,);
      await db
        .updateTable("npc_states",)
        .set({ health: newHealth, mental_state: newHealth <= 0 ? "defeated" : "hostile", },)
        .where("actor_id", "=", defenderId,)
        .execute();
    }
  }
}

async function applyItemTransfer(
  _itemsService: ItemsService,
  _worldId: string,
  _event: WorldEvent,
): Promise<void> {
  // For v1: just log the transfer. Actual item resolution requires
  // matching item names to definitions, which needs LLM-assisted matching.
  // This placeholder ensures the event is recorded without error.
}
