// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

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

/** */
export interface AppendTimelineOpts {
  db: Kysely<DB>;
  worldId: string;
  storyId: string | null;
  events: readonly WorldEvent[];
}

/** */
export interface SeedBackstoryOpts {
  db: Kysely<DB>;
  worldId: string;
  description: string;
  occurredAt: string;
  eventType?: string;
  actorId?: string | null;
  data?: Record<string, unknown>;
  storyId?: string | null;
  /**
   * When set, also promotes the backstory event to a world_lore_entries row
   *  with this audience scope, so `loreSection` picks it up (§5.2).
   */
  audienceScope?: LoreScope;
}

/** */
export interface EstablishedHistoryOpts {
  db: Kysely<DB>;
  worldId: string;
  /** Events with `occurred_at` strictly before this timestamp are "established history". */
  since: string;
  limit?: number;
}

/** */
export interface ListTimelineOpts {
  db: Kysely<DB>;
  worldId: string;
  /** Branch to scope to (world_timelines.id). Undefined = all branches. */
  timelineId?: string;
  occurredBefore?: string;
  occurredAfter?: string;
  limit?: number;
}

// ── Commands ────────────────────────────────────────────────

/**
 * Persist applied events to the world timeline.
 * Called from `applyEvents` — one row per successful event, preserving the
 * event's own timestamp as `occurred_at` and tagging provenance via `storyId`.
 * @param root0
 * @param root0.db
 * @param root0.worldId
 * @param root0.storyId
 * @param root0.events
 * @returns {Promise<void>}
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
 * @param root0
 * @param root0.db
 * @param root0.worldId
 * @param root0.description
 * @param root0.occurredAt
 * @param root0.eventType
 * @param root0.actorId
 * @param root0.data
 * @param root0.storyId
 * @param root0.audienceScope
 * @returns {Promise<string>}
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
 * Optional branch (timelineId), time-range and limit filters.
 * @param root0
 * @param root0.db
 * @param root0.worldId
 * @param root0.timelineId
 * @param root0.occurredBefore
 * @param root0.occurredAfter
 * @param root0.limit
 * @returns {Promise<TimelineEntry[]>}
 */
export async function listTimelineEntries(
  { db, worldId, timelineId, occurredBefore, occurredAfter, limit, }: ListTimelineOpts,
): Promise<TimelineEntry[]> {
  let query = db
    .selectFrom("world_timeline_events",)
    .selectAll()
    .where("world_id", "=", worldId,);

  if (timelineId !== undefined) {
    query = query.where("timeline_id", "=", timelineId,);
  }

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
 * @param root0
 * @param root0.db
 * @param root0.worldId
 * @param root0.since
 * @param root0.limit
 * @returns {Promise<TimelineEntry[]>}
 */
export async function getEstablishedHistory(
  { db, worldId, since, limit, }: EstablishedHistoryOpts,
): Promise<TimelineEntry[]> {
  return listTimelineEntries({ db, worldId, occurredBefore: since, limit, },);
}

// ── Cross-chat propagation (epic-memory-propagation) ────────

/**
 * Order events collected across sessions/chats into one deterministic
 * sequence: `occurred_at` ascending, ties broken by ingest time
 * (`created_at`, then `id`) so equal-timestamp events from different
 * sessions interleave stably across reloads.
 * @param events - entries from any number of sessions
 * @returns a new chronologically ordered array
 */
export function orderAcrossSessions(
  events: readonly TimelineEntry[],
): TimelineEntry[] {
  return [...events,].sort((a, b,) =>
    a.occurred_at.localeCompare(b.occurred_at,) ||
    a.created_at.localeCompare(b.created_at,) ||
    a.id.localeCompare(b.id,)
  );
}

/** Two timeline events recorded as contradictory versions of one moment. */
export interface EventConflict {
  first: TimelineEntry;
  second: TimelineEntry;
  /** Why the pair conflicts. */
  reason: "same_moment_divergent_description";
}

/**
 * Detect contradictory events across sessions: two events by the same actor
 * at the same `occurred_at` whose descriptions disagree are conflicting
 * records of the same moment — a merge must not keep both as independent
 * truth. Events are compared in {@link orderAcrossSessions} order; the
 * earlier-ingested one is `first`.
 * @param events - entries from any number of sessions
 * @returns conflicting pairs, first-seen order
 */
export function detectEventConflicts(
  events: readonly TimelineEntry[],
): EventConflict[] {
  const ordered = orderAcrossSessions(events,);
  const conflicts: EventConflict[] = [];
  for (let i = 0; i < ordered.length; i++) {
    const first = ordered[i]!;
    for (let j = i + 1; j < ordered.length; j++) {
      const second = ordered[j]!;
      // Ordered by occurred_at: once we leave the moment, no later pair matches.
      if (second.occurred_at !== first.occurred_at) { break; }
      if (
        first.actor_id !== null &&
        first.actor_id === second.actor_id &&
        first.description !== second.description
      ) {
        conflicts.push({ first, second, reason: "same_moment_divergent_description", },);
      }
    }
  }

  return conflicts;
}

/** */
export interface MergeTimelinesOpts {
  db: Kysely<DB>;
  worldId: string;
  /** Timeline whose events move into `intoTimelineId`. */
  fromTimelineId: string;
  /** Timeline absorbing the events. */
  intoTimelineId: string;
}

/** Identity key of a timeline event: type + actor + description + moment. */
function eventIdentityKey(event: {
  event_type: string;
  actor_id: string | null;
  description: string;
  occurred_at: string;
},): string {
  return [
    event.event_type,
    event.actor_id ?? "",
    event.description,
    event.occurred_at,
  ].join("\u0000",);
}

/**
 * Merge one timeline into another (multi-session world merge): every event
 * of `fromTimelineId` is re-tagged to `intoTimelineId`, except exact
 * duplicates — same event_type + actor_id + description + occurred_at —
 * already present in the target timeline, which stay behind untouched.
 * `fromTimelineId === intoTimelineId` refuses rather than silently no-oping.
 * @param root0
 * @param root0.db
 * @param root0.worldId
 * @param root0.fromTimelineId
 * @param root0.intoTimelineId
 * @returns how many events moved
 * @throws {Error} on self-merge
 */
export async function mergeTimelineEvents(
  { db, worldId, fromTimelineId, intoTimelineId, }: MergeTimelinesOpts,
): Promise<number> {
  if (fromTimelineId === intoTimelineId) {
    throw new Error("mergeTimelineEvents: refusing self-merge",);
  }

  const source = await db
    .selectFrom("world_timeline_events",)
    .select(["id", "event_type", "actor_id", "description", "occurred_at",],)
    .where("world_id", "=", worldId,)
    .where("timeline_id", "=", fromTimelineId,)
    .execute();

  const targetRows = await db
    .selectFrom("world_timeline_events",)
    .select(["event_type", "actor_id", "description", "occurred_at",],)
    .where("world_id", "=", worldId,)
    .where("timeline_id", "=", intoTimelineId,)
    .execute();

  const targetKeys = new Set(Array.from(targetRows, eventIdentityKey,),);

  let moved = 0;
  for (const event of source) {
    const key = eventIdentityKey(event,);
    if (targetKeys.has(key,)) { continue; }
    await db
      .updateTable("world_timeline_events",)
      .set({ timeline_id: intoTimelineId, },)
      .where("id", "=", event.id,)
      .execute();

    targetKeys.add(key,);
    moved++;
  }

  return moved;
}
