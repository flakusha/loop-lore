// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * World dashboard list data — previews for the worlds list page
 * (TASK-world-dashboard). Loads per-world location/NPC counts and the
 * current conditions (weather, time of day sampled from the world's
 * freshest location_state) in a fixed number of queries, and renders the
 * world cards. Conditions are read-only display: the same sampled snapshot
 * the world SSE stream pushes (routes/worlds/world-stream.ts).
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { jsonParseOr, } from "../../utils";
import { toDate, } from "../../utils/date";
import { escapeHtml, } from "./layout";

/** A world plus its dashboard preview data. */
export interface WorldListCard {
  id: string;
  name: string;
  description: string | null;
  updatedAt: string | null;
  locationCount: number;
  npcCount: number;
  timeOfDay: string | null;
  weather: string | null;
}

/** A world row with only the fields the card needs. */
export interface WorldListRow {
  id: string;
  name: string;
  description: string | null;
  updated_at: string | null;
}

/**
 * Distinct NPC actor ids mentioned across a world's location_states,
 * aggregated from the raw npcs_present JSON columns.
 * @param statesByWorld
 * @param worldId
 */
function countDistinctNpcs(
  statesByWorld: Map<string, Array<{ world_id: string; npcs_present: string }>>,
  worldId: string,
): number {
  const ids = new Set<string>();
  for (const s of statesByWorld.get(worldId,) ?? []) {
    const parsed = jsonParseOr<unknown>(s.npcs_present, null,);
    if (!Array.isArray(parsed,)) { continue; }
    for (const id of parsed) {
      if (typeof id === "string") { ids.add(id,); }
    }
  }

  return ids.size;
}

/**
 * Load dashboard preview data for the given worlds. Three queries total,
 * regardless of world count (locations, location_states, none for worlds
 * themselves — rows are passed in).
 * @param database
 * @param worlds
 * @returns one card per world, with location/NPC counts and the freshest conditions
 */
export async function loadWorldListCards(
  database: Kysely<DB>,
  worlds: WorldListRow[],
): Promise<WorldListCard[]> {
  if (worlds.length === 0) { return []; }
  const worldIds = Array.from(worlds, (w,) => w.id,);

  const locationCounts = await database
    .selectFrom("locations",)
    .select((eb,) => ["world_id", eb.fn.countAll<number>().as("total",),])
    .where("world_id", "in", worldIds,)
    .groupBy("world_id",)
    .execute();

  const countByWorld = new Map(locationCounts.map((r,) => [r.world_id, Number(r.total,),]),);

  const states = await database
    .selectFrom("location_states",)
    .select(["world_id", "npcs_present", "time_of_day", "weather", "updated_at",],)
    .where("world_id", "in", worldIds,)
    .orderBy("updated_at", "asc",)
    .execute();

  const statesByWorld = new Map<string, typeof states>();
  for (const s of states) {
    const bucket = statesByWorld.get(s.world_id,);
    if (bucket) { bucket.push(s,); }
    else { statesByWorld.set(s.world_id, [s,],); }
  }

  return worlds.map((w,) => {
    const worldStates = statesByWorld.get(w.id,) ?? [];
    // States were ordered ascending by updated_at, so the last one is the
    // freshest — the same sample the conditions SSE stream would push.
    const freshest = worldStates[worldStates.length - 1];
    return {
      id: w.id,
      name: w.name,
      description: w.description,
      updatedAt: w.updated_at,
      locationCount: countByWorld.get(w.id,) ?? 0,
      npcCount: countDistinctNpcs(statesByWorld, w.id,),
      timeOfDay: freshest?.time_of_day ?? null,
      weather: freshest?.weather ?? null,
    };
  },);
}

/**
 * Human-relative age of an ISO timestamp against `now`
 * ("just now" / "5m ago" / "3h ago" / "2d ago" / the date itself).
 * @param iso
 * @param nowMs
 * @returns the human-relative age label
 */
export function formatRelativeAge(iso: string | null, nowMs: number,): string {
  if (!iso) { return "never"; }
  const then = toDate(iso,).getTime();
  if (Number.isNaN(then,)) { return "never"; }

  const seconds = Math.max(0, Math.floor((nowMs - then) / 1000,),);
  if (seconds < 60) { return "just now"; }
  const minutes = Math.floor(seconds / 60,);
  if (minutes < 60) { return `${minutes}m ago`; }
  const hours = Math.floor(minutes / 60,);
  if (hours < 24) { return `${hours}h ago`; }
  const days = Math.floor(hours / 24,);
  if (days < 30) { return `${days}d ago`; }
  return toDate(then,).toISOString().slice(0, 10,);
}

/**
 * Render one world card for the worlds list (conditions badges + previews).
 * @param card
 * @param nowMs
 * @returns the HTML markup for one world card
 */
export function renderWorldCard(card: WorldListCard, nowMs: number,): string {
  const conditions: string[] = [];
  if (card.timeOfDay) { conditions.push(`<span class="condition">🕑 ${escapeHtml(card.timeOfDay,)}</span>`,); }
  if (card.weather) { conditions.push(`<span class="condition">🌦 ${escapeHtml(card.weather,)}</span>`,); }
  const conditionsHtml = conditions.length > 0
    ? `<div class="world-conditions">${conditions.join("",)}</div>`
    : "";

  return `<div class="world-card" x-on:click="window.location.assign('/worlds/${card.id}')" data-testid="world-card-${card.id}">
    <div class="world-header"><h3 class="world-name">${
    escapeHtml(card.name,)
  }</h3><span class="world-id">ID: ${card.id}</span></div>
    <div class="world-description">${escapeHtml(card.description ?? "",)}</div>
    ${conditionsHtml}
    <div class="world-meta">
      <span class="tag">📍 ${card.locationCount} locations</span>
      <span class="tag">👤 ${card.npcCount} NPCs</span>
      <span class="tag">📅 ${escapeHtml(formatRelativeAge(card.updatedAt, nowMs,),)}</span>
    </div>
  </div>`;
}
