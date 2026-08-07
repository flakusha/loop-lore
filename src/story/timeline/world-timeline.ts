/**
 * World Timeline Service
 *
 * Chronological ledger of world events (docs/spec/lore.md §5).
 * - `appendTimelineEvents` — called automatically from `applyEvents`; records
 *   every event that was successfully applied so cross-session stories share a
 *   consistent timeline.
 * - `seedBackstory` — GM-authored established history with explicit
 *   `occurred_at`; renders as known lore rather than fresh discoveries (§5.2).
 * - `listTimelineEntries` / `getEstablishedHistory` — query helpers for lore
 *   injection and forward-event steering (§5.3).
 */
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import type { LoreScope, } from "../../assistant/lore/audience";
import type { WorldEventType, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { promoteEventToLore, } from "../events/promote-lore";
import { serializeOrThrow, } from "../shared/story-utils";
import type { WorldEvent, } from "../story-events-types";

// ── Types ───────────────────────────────────────────────────

/** Shape returned by query helpers (mirrors WorldTimelineEvents columns). */
export interface TimelineEntry {
  id: string;
  world_id: string;
  story_id: string | null;
  event_type: string;
  actor_id: string | null;
  description: string;
  data: string | null;
  occurred_at: string;
  created_at: string;
}

export interface AppendTimelineOpts {
  db: Kysely<DB>;
  worldId: string;
  storyId: string | null;
  events: readonly WorldEvent[];
}

export interface SeedBackstoryOpts {
  db: Kysely<DB>;
  worldId: string;
  description: string;
  occurredAt: string;
  eventType?: string;
  actorId?: string | null;
  data?: Record<string, unknown>;
  storyId?: string | null;
  /** When set, also promotes the backstory event to a world_lore_entries row
   *  with this audience scope, so `loreSection` picks it up (§5.2). */
  audienceScope?: LoreScope;
}

export interface EstablishedHistoryOpts {
  db: Kysely<DB>;
  worldId: string;
  /** Events with `occurred_at` strictly before this timestamp are "established history". */
  since: string;
  limit?: number;
}

export interface ListTimelineOpts {
  db: Kysely<DB>;
  worldId: string;
  occurredBefore?: string;
  occurredAfter?: string;
  limit?: number;
}

// ── Commands ────────────────────────────────────────────────

/**
 * Persist applied events to the world timeline.
 * Called from `applyEvents` — one row per successful event, preserving the
 * event's own timestamp as `occurred_at` and tagging provenance via `storyId`.
 */
export async function appendTimelineEvents(
  { db, worldId, storyId, events, }: AppendTimelineOpts,
): Promise<void> {
  const now = new Date().toISOString();
  for (const event of events) {
    await db
      .insertInto("world_timeline_events",)
      .values({
        id: randomUUID(),
        world_id: worldId,
        story_id: storyId,
        event_type: event.type,
        actor_id: event.actorId ?? null,
        description: event.description,
        data: serializeOrThrow(event.data, "data",),
        occurred_at: event.timestamp,
        created_at: now,
      },)
      .execute();
  }
}

/**
 * Seed a GM-authored backstory event. Past `occurredAt` values create
 * established history that renders as known lore, not fresh discoveries
 * (docs/spec/lore.md §5.2).
 */
export async function seedBackstory(
  { db, worldId, description, occurredAt, eventType, actorId, data, storyId, audienceScope, }: SeedBackstoryOpts,
): Promise<string> {
  const id = randomUUID();
  const now = new Date().toISOString();
  await db
    .insertInto("world_timeline_events",)
    .values({
      id,
      world_id: worldId,
      story_id: storyId ?? null,
      event_type: eventType ?? "world_lore_update",
      actor_id: actorId ?? null,
      description,
      data: data ? serializeOrThrow(data, "data",) : null,
      occurred_at: occurredAt,
      created_at: now,
    },)
    .execute();

  // Optionally promote to audience-scoped lore (docs/spec/lore.md §5.2).
  // promoteEventToLore reads audienceScope from event.data.audienceScope.
  if (audienceScope) {
    const syntheticEvent: WorldEvent = {
      type: (eventType ?? "world_lore_update") as WorldEventType,
      description,
      timestamp: occurredAt,
      data: { ...data, audienceScope, },
      ...(actorId && { actorId, }),
    };
    await promoteEventToLore(db, worldId, syntheticEvent,);
  }

  return id;
}

// ── Queries ─────────────────────────────────────────────────

/**
 * List timeline entries for a world, ordered chronologically.
 * Optional time-range and limit filters.
 */
export async function listTimelineEntries(
  { db, worldId, occurredBefore, occurredAfter, limit, }: ListTimelineOpts,
): Promise<TimelineEntry[]> {
  let query = db
    .selectFrom("world_timeline_events",)
    .selectAll()
    .where("world_id", "=", worldId,);

  if (occurredBefore !== undefined) {
    query = query.where("occurred_at", "<", occurredBefore,);
  }
  if (occurredAfter !== undefined) {
    query = query.where("occurred_at", ">", occurredAfter,);
  }

  return query
    .orderBy("occurred_at", "asc",)
    .limit(limit ?? 100,)
    .execute();
}

/**
 * Return events whose `occurred_at` is strictly before the given timestamp.
 * Used by the lore injection pipeline: these render as *established history*
 * rather than fresh discoveries (§5.2).
 */
export async function getEstablishedHistory(
  { db, worldId, since, limit, }: EstablishedHistoryOpts,
): Promise<TimelineEntry[]> {
  return listTimelineEntries({ db, worldId, occurredBefore: since, limit, },);
}
