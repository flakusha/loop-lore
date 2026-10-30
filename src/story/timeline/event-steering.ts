// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Forward Event Steering (docs/spec/lore.md §5.3) + cross-story convergence
 * queries (§5.4).
 *
 * A GM creates a steering — a teaser for a future event that MAY manifest.
 * Steerings inject as audience-scoped foreshadowing; they never mutate state
 * until a resolution (GM confirmation, explicit dismiss, or probability roll)
 * decides they materialized. Red herrings (`mayManifest: false`) are pure
 * atmosphere and can never manifest.
 *
 * Cross-story convergence (§5.4) reads the shared world timeline excluding
 * the caller's own story, so sibling chats observe each other's consequences
 * while audience filtering stays with the prompt layer.
 */
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import type { LoreScope, } from "../../assistant/lore/audience";
import { WorldEventType, } from "../../db/enums-story";
import type { DB, } from "../../db/schema";
import { serializeOrThrow, } from "../shared/story-utils";
import { appendTimelineEvents, } from "./world-timeline";

/** Lifecycle states of a steering row. */
export const SteeringStatus = {
  Pending: "pending",
  Manifested: "manifested",
  Dismissed: "dismissed",
} as const;
/** */
export type SteeringStatus = (typeof SteeringStatus)[keyof typeof SteeringStatus];

/** Selected row of `world_event_steerings` (plain columns, no Generated wrappers). */
export interface SteeringRow {
  id: string;
  world_id: string;
  timeline_id: string;
  description: string;
  manifest_probability: number;
  conditions: string | null;
  may_manifest: number;
  status: string;
  audience_scope: string | null;
  resolved_at: string | null;
  created_at: string;
}

/** */
export interface CreateSteeringOpts {
  db: Kysely<DB>;
  worldId: string;
  description: string;
  manifestProbability?: number;
  conditions?: string[];
  mayManifest?: boolean;
  timelineId?: string;
  audienceScope?: LoreScope;
}

/** */
export interface ListSteeringsOpts {
  db: Kysely<DB>;
  worldId: string;
  timelineId?: string;
  limit?: number;
}

/** */
export interface RollSteeringOpts {
  db: Kysely<DB>;
  id: string;
  random?: () => number;
}

/** */
export interface ResolveSteeringOpts {
  db: Kysely<DB>;
  id: string;
  manifest: boolean;
}

/**
 * Create a GM steering teaser. Probability must be within 0–1.
 * @param root0
 * @param root0.db
 * @param root0.worldId
 * @param root0.description
 * @param root0.manifestProbability
 * @param root0.conditions
 * @param root0.mayManifest
 * @param root0.timelineId
 * @param root0.audienceScope
 * @returns The new steering id.
 * @throws {RangeError} When the probability is outside 0–1.
 * @throws {Error} When the description is empty.
 * @throws {Error} When `timelineId` is provided but empty/whitespace — the
 *   caller must either omit it (prime default) or name a real branch.
 */
export async function createSteering(
  { db, worldId, description, manifestProbability, conditions, mayManifest, timelineId, audienceScope, }:
    CreateSteeringOpts,
): Promise<string> {
  if (!description.trim()) {
    throw new Error("Steering description must not be empty.",);
  }

  // `??` below only catches null/undefined, so an empty string would slip
  // through and seed an orphan branch id (TASK-timeline-steering gap 2).
  if (timelineId !== undefined && !timelineId.trim()) {
    throw new Error("Steering timelineId must not be empty when provided.",);
  }

  const probability = manifestProbability ?? 0.5;
  if (!Number.isFinite(probability,) || probability < 0 || probability > 1) {
    throw new RangeError(`manifestProbability must be within 0–1, got ${manifestProbability}.`,);
  }

  const id = randomUUID();
  await db
    .insertInto("world_event_steerings",)
    .values({
      id,
      world_id: worldId,
      timeline_id: timelineId ?? "prime",
      description,
      manifest_probability: probability,
      conditions: conditions ? serializeOrThrow(conditions, "conditions",) : null,
      may_manifest: mayManifest === false ? 0 : 1,
      audience_scope: audienceScope ? serializeOrThrow(audienceScope, "audienceScope",) : null,
    },)
    .execute();

  return id;
}

/**
 * List pending steerings for foreshadowing injection, oldest first.
 * Red herrings are included — they are atmosphere, not state.
 * @param root0
 * @param root0.db
 * @param root0.worldId
 * @param root0.timelineId
 * @param root0.limit
 * @returns {Promise<SteeringRow[]>}
 */
export async function listPendingSteerings(
  { db, worldId, timelineId, limit, }: ListSteeringsOpts,
): Promise<SteeringRow[]> {
  let query = db
    .selectFrom("world_event_steerings",)
    .selectAll()
    .where("world_id", "=", worldId,)
    .where("status", "=", SteeringStatus.Pending,);

  if (timelineId !== undefined) {
    query = query.where("timeline_id", "=", timelineId,);
  }

  return query
    .orderBy("created_at", "asc",)
    .limit(limit ?? 20,)
    .execute();
}

/**
 * Roll manifestation for a pending steering. A failed roll leaves the steering
 * pending; red herrings never manifest. A manifested steering appends a timeline event.
 * @param root0
 * @param root0.db
 * @param root0.id
 * @param root0.random
 * @returns True when the steering manifested on this roll.
 * @throws {Error} When the steering id is unknown.
 */
export async function rollSteering(
  { db, id, random, }: RollSteeringOpts,
): Promise<boolean> {
  // The pending-status read MUST run inside the same transaction as the
  // status flip + timeline append: a read outside would let two concurrent
  // manifest rolls both observe Pending and append duplicate timeline events
  // (TASK-timeline-steering gap 1).
  return db.transaction().execute(async (trx,) => {
    const row = await trx
      .selectFrom("world_event_steerings",)
      .selectAll()
      .where("id", "=", id,)
      .executeTakeFirst();

    if (!row) {
      throw new Error(`Unknown steering ${id}.`,);
    }

    if (row.status !== SteeringStatus.Pending) {
      return row.status === SteeringStatus.Manifested;
    }

    if (row.may_manifest === 0) {
      return false;
    }

    const roll = (random ?? Math.random)();
    if (!(roll < row.manifest_probability)) {
      return false;
    }

    const now = new Date().toISOString();
    // Status flip and timeline append commit together: a crash between two
    // independent writes would mark the steering Manifested while the
    // timeline event is lost (BUG-timeline-event-steering).
    await trx
      .updateTable("world_event_steerings",)
      .set({ status: SteeringStatus.Manifested, resolved_at: now, },)
      .where("id", "=", id,)
      .execute();

    await appendTimelineEvents({
      db: trx,
      worldId: row.world_id,
      storyId: null,
      events: [{
        type: WorldEventType.WorldLoreUpdate,
        timestamp: now,
        description: row.description,
        data: { steeringId: id, },
      },],
    },);

    return true;
  },);
}

/**
 * Explicit GM resolution. Forcing a red herring to manifest is rejected —
 * dismiss it instead.
 * @param root0
 * @param root0.db
 * @param root0.id
 * @param root0.manifest
 * @throws {Error} When the steering is unknown, already resolved, or a red herring forced to manifest.
 * @returns {Promise<void>}
 */
export async function resolveSteering(
  { db, id, manifest, }: ResolveSteeringOpts,
): Promise<void> {
  // The status read happens inside the same transaction as the resolution
  // write so a concurrent roll/resolve cannot both observe Pending
  // (TASK-timeline-steering gap 1). Throws inside roll the tx back — safe,
  // nothing has been written yet.
  await db.transaction().execute(async (trx,) => {
    const row = await trx
      .selectFrom("world_event_steerings",)
      .select(["may_manifest", "status", "world_id", "description",],)
      .where("id", "=", id,)
      .executeTakeFirst();

    if (!row) {
      throw new Error(`Unknown steering ${id}.`,);
    }

    if (row.status !== SteeringStatus.Pending) {
      throw new Error(`Steering ${id} is already ${row.status}.`,);
    }

    if (manifest && row.may_manifest === 0) {
      throw new Error(`Steering ${id} is a red herring and cannot manifest; dismiss it instead.`,);
    }

    const now = new Date().toISOString();
    // Same atomicity contract as rollSteering: the dismissal/manifestation
    // stamp and the appended timeline event commit or roll back together.
    await trx
      .updateTable("world_event_steerings",)
      .set({ status: manifest ? SteeringStatus.Manifested : SteeringStatus.Dismissed, resolved_at: now, },)
      .where("id", "=", id,)
      .execute();

    if (manifest) {
      await appendTimelineEvents({
        db: trx,
        worldId: row.world_id,
        storyId: null,
        events: [{
          type: WorldEventType.WorldLoreUpdate,
          timestamp: now,
          description: row.description,
          data: { steeringId: id, },
        },],
      },);
    }
  },);
}
