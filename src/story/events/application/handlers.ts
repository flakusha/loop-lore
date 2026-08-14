/**
 * Event Application — Event Handlers
 *
 * Per-event-type DB handlers, dispatched from applySingleEvent.
 */
import type { Kysely, } from "kysely";
import { WorldEventType, } from "../../../db/enums";
import type { DB, } from "../../../db/schema";
import { assertNever, safeJsonStringify, } from "../../../utils";
import type { ItemsService, } from "../../items";
import type { WorldEvent, } from "../../types";
import { promoteEventToLore, } from "../promote-lore";
import { applyItemTransfer, } from "./item-transfer";
import type { AppliedEvent, } from "./types";
export { applyItemTransfer, };

export async function applySingleEvent(
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
      await applyItemTransfer(database, items, worldId, event,);
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

export async function applyLocationChange(db: Kysely<DB>, event: WorldEvent,): Promise<void> {
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

export async function applyNpcStateChange(db: Kysely<DB>, event: WorldEvent,): Promise<void> {
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

export async function applyTimeAdvancement(db: Kysely<DB>, worldId: string, event: WorldEvent,): Promise<void> {
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

export async function applyLocationModification(db: Kysely<DB>, event: WorldEvent,): Promise<void> {
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

export async function applyWorldLoreUpdate(db: Kysely<DB>, worldId: string, event: WorldEvent,): Promise<void> {
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

    // Also promote to a structured, audience-scoped world_lore_entries row so the new
    // fact is injectable by loreSection (docs/spec/lore.md §4.1). Additive — the
    // `worlds.lore` text blob above is kept for display/backward-compat.
    if (event.data.promoteToLore !== false) {
      await promoteEventToLore(db, worldId, event,);
    }
  }
}

export async function applyCombatEvent(db: Kysely<DB>, event: WorldEvent,): Promise<void> {
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
