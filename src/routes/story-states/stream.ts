// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Story-state snapshot SSE stream. Pushes the world's story-state read model —
 * world-state snapshots, NPC states, location states and quest rows — to the
 * GM panel / story view. Recomputes the snapshot on an interval and emits a
 * `story-state` event only when it changes (poll-and-diff, same convention as
 * routes/worlds/world-stream.ts). The client keeps `refresh()` as the offline
 * fallback; a dropped connection is repaired by the EventSource reconnect.
 *
 * Contract (owned by TASK-clarify-story-state-sse-subscription-contract):
 * - `GET /api/v1/worlds/:worldId/story-stream`
 * - snapshot event `story-state` carrying counts + freshness watermarks per
 *   slice (never full JSON blobs)
 * - reconnect replays the current snapshot immediately on subscribe
 *
 * Auth mirrors the sibling read endpoints: world read access (owner /
 * admin.world / member / public-authenticated) via requireWorldAccess.
 */
import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { getChildLogger, } from "../../logger";
import { ErrorResponse, Id, } from "../../validation/schemas";
import { extractAuth, } from "../http-utils";
import { sseStream, } from "../sse-stream";
import { requireWorldAccess, } from "../worlds/access";

export const STORY_STATE_POLL_INTERVAL_MS = 15_000;
// Same window as the notification/activity/world streams: Bun.serve's idle
// timeout severs a connection after 10s without traffic.
export const STORY_STATE_KEEPALIVE_MS = 8_000;

/** Counts + freshness watermark for one story-state slice. */
export interface StoryStateSliceSummary {
  readonly count: number;
  /** Max `updated_at` (`created_at` where the table has none), null when empty. */
  readonly updatedAt: string | null;
}

/** Snapshot pushed over the story-state stream (initial + changes). */
export interface StoryStateSnapshot {
  readonly worldStates: StoryStateSliceSummary;
  readonly npcStates: StoryStateSliceSummary;
  readonly locationStates: StoryStateSliceSummary;
  readonly quests: StoryStateSliceSummary;
}

const EMPTY_SLICE: StoryStateSliceSummary = { count: 0, updatedAt: null, };

/**
 * Load one story-state slice: row count + freshness watermark. Never rejects:
 * a failing slice degrades to empty so one bad table cannot break the stream.
 * @param database
 * @param table story table to summarize
 * @param updatedColumn freshness column for the table
 * @param worldId world to scope the summary to
 * @returns the slice summary
 */
async function loadSlice(
  database: Kysely<DB>,
  table: "world_states" | "npc_states" | "location_states" | "quests",
  updatedColumn: "created_at" | "updated_at",
  worldId: string,
): Promise<StoryStateSliceSummary> {
  const log = getChildLogger("routes/story-states",);
  try {
    const row = await database
      .selectFrom(table,)
      .select([
        database.fn.countAll<number>().as("count",),
        database.fn.max<string>(updatedColumn,).as("watermark",),
      ],)
      .where("world_id", "=", worldId,)
      .executeTakeFirst();

    const count = Number(row?.count ?? 0,);
    return {
      count: Number.isFinite(count,) ? count : 0,
      updatedAt: row?.watermark ?? null,
    };
  } catch (error) {
    log?.warn("story-state snapshot slice failed", { table, error, },);
    return EMPTY_SLICE;
  }
}

/**
 * Load the world's story-state snapshot (row counts + freshness watermarks).
 * @param database
 * @param worldId
 * @returns the story-state snapshot
 */
export async function loadStoryStateSnapshot(
  database: Kysely<DB>,
  worldId: string,
): Promise<StoryStateSnapshot> {
  const settled = await Promise.allSettled([
    loadSlice(database, "world_states", "created_at", worldId,),
    loadSlice(database, "npc_states", "updated_at", worldId,),
    loadSlice(database, "location_states", "updated_at", worldId,),
    loadSlice(database, "quests", "updated_at", worldId,),
  ],);

  const at = (r: PromiseSettledResult<StoryStateSliceSummary>,): StoryStateSliceSummary =>
    r.status === "fulfilled" ? r.value : EMPTY_SLICE;

  return {
    worldStates: at(settled[0]!,),
    npcStates: at(settled[1]!,),
    locationStates: at(settled[2]!,),
    quests: at(settled[3]!,),
  };
}

/**
 * Stable wire fingerprint used to detect story-state changes between ticks.
 * @param snap current story-state snapshot
 * @returns fingerprint string
 */
export const storyStateFingerprint = (snap: StoryStateSnapshot,): string => {
  const slice = (s: StoryStateSliceSummary,): string => `${s.count}|${s.updatedAt ?? ""}`;
  return [
    slice(snap.worldStates,),
    slice(snap.npcStates,),
    slice(snap.locationStates,),
    slice(snap.quests,),
  ].join("~",);
};

/**
 * SSE streamer for a world's story-state snapshot. `intervalMs` is injectable
 * for tests; production uses STORY_STATE_POLL_INTERVAL_MS.
 */
export class StoryStateStreamer {
  /**
   * @param database
   * @param worldId
   * @param intervalMs
   */
  constructor(
    private readonly database: Kysely<DB>,
    private readonly worldId: string,
    private readonly intervalMs: number = STORY_STATE_POLL_INTERVAL_MS,
  ) {}

  /**
   * @returns {Response}
   */
  open(): Response {
    let lastFingerprint = "";
    return sseStream(async (send,) => {
      try {
        const snap = await loadStoryStateSnapshot(this.database, this.worldId,);
        const fp = storyStateFingerprint(snap,);
        if (fp !== lastFingerprint) {
          lastFingerprint = fp;
          send("story-state", snap,);
        }
      } catch {
        // transient DB error — skip this tick, keep stream alive
      }
    }, {
      intervalMs: this.intervalMs,
      keepaliveMs: STORY_STATE_KEEPALIVE_MS,
      onStart: async (send,) => {
        const snap = await loadStoryStateSnapshot(this.database, this.worldId,);
        lastFingerprint = storyStateFingerprint(snap,);
        send("story-state", snap,);
      },
    },);
  }
}

interface StoryStreamCtx {
  params: { worldId: string };
}

/**
 * @param opts database handle (config-free; the stream reads snapshots only)
 * @param prefix
 * @returns {Elysia}
 */
export function storyStateStreamRoutes(opts: { database: Kysely<DB> }, prefix = "/api",) {
  const { database, } = opts;

  return new Elysia({ name: "story-states-stream", },)
    .get(
      `${prefix}/worlds/:worldId/story-stream`,
      async (ctx: unknown,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        const { worldId, } = (ctx as StoryStreamCtx).params;
        const accessErr = await requireWorldAccess(database, worldId, userId, userRole,);
        if (accessErr) { return accessErr; }
        return new StoryStateStreamer(database, worldId,).open();
      },
      {
        params: t.Object({ worldId: Id, },),
        response: { 200: t.Any(), 401: ErrorResponse, 404: ErrorResponse, },
        detail: {
          summary: "Story-state stream",
          description:
            "SSE stream of the world's story-state snapshot (world states, NPC states, location states, quests). Emits a `story-state` snapshot on connect and whenever any slice changes.",
          tags: ["Story States",],
        },
      },
    );
}
