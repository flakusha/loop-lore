// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * What-If Branch Simulator (docs/spec/lore.md §5).
 *
 * Forks a world timeline onto a synthetic branch, produces deterministic
 * hypothetical outcome beats from established history + steering seeds, and
 * diffs branches by (event_type, description, occurred_at) key.
 */
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import type { DB, } from "../db/schema";
import { listPendingSteerings, } from "./timeline/event-steering";
import { listTimelineEntries, } from "./timeline/world-timeline";
import type { TimelineEntry, } from "./timeline/world-timeline";

/** Timeline entry as stored — TimelineEntry plus its owning branch. */
type TimelineEntryWithTimeline = TimelineEntry & { timeline_id: string };

// ── Types ───────────────────────────────────────────────────

/** One hypothetical outcome beat on a forked branch. */
export interface WhatIfBeat {
  id: string;
  timelineId: string;
  description: string;
  /** Timeline entry ids this beat extrapolates from. */
  divergesFrom: string[];
}

/** */
export interface WhatIfSimulatorOptions {
  db: Kysely<DB>;
  worldId: string;
  /** Source timeline the fork starts from. */
  timelineId: string;
}

/** */
export interface BranchDiff {
  onlyInA: TimelineEntry[];
  onlyInB: TimelineEntry[];
  shared: TimelineEntry[];
}

/** */
export interface WhatIfSimulatorService {
  /**
   * Create a non-prime branch of the world and return its id.
   * @param name
   * @returns {Promise<string>}
   */
  fork(name: string,): Promise<string>;

  /**
   * Produce deterministic hypothetical outcome beats named from
   * `hypothetical`, extrapolated from the source timeline's history and
   * pending steerings. Nothing is persisted.
   * @param hypothetical
   * @param count
   * @returns {Promise<WhatIfBeat[]>}
   */
  simulateFork(hypothetical: string, count?: number,): Promise<WhatIfBeat[]>;

  /**
   * Same as {@link WhatIfSimulatorService.simulateFork}, but tags the beats
   * onto `targetTimelineId` (e.g. a fork from {@link fork}) and derives
   * anchors from that branch's rows.
   * @param hypothetical
   * @param targetTimelineId
   * @param count
   * @returns {Promise<WhatIfBeat[]>}
   */
  simulateForkFor(
    hypothetical: string,
    targetTimelineId: string,
    count?: number,
  ): Promise<WhatIfBeat[]>;

  /**
   * Set-difference two timelines' entries, keyed by
   * (event_type, description, occurred_at).
   * @param keyTimelineId
   * @param otherTimelineId
   * @returns {Promise<BranchDiff>}
   */
  diffBranches(keyTimelineId: string, otherTimelineId: string,): Promise<BranchDiff>;
}

// ── Factory ─────────────────────────────────────────────────

/**
 * @param opts
 */
export function createWhatIfSimulator(
  opts: WhatIfSimulatorOptions,
): WhatIfSimulatorService {
  return {
    /**
     * @param name
     */
    async fork(name: string,): Promise<string> {
      const id = randomUUID();
      await opts.db
        .insertInto("world_timelines",)
        .values({
          id,
          world_id: opts.worldId,
          name,
          is_prime: 0,
        },)
        .execute();

      return id;
    },

    /**
     * @param hypothetical
     * @param count
     */
    async simulateFork(hypothetical: string, count = 3,): Promise<WhatIfBeat[]> {
      return this.simulateForkFor(hypothetical, opts.timelineId, count,);
    },

    /**
     * Simulate outcome beats tagged onto the given branch timeline (e.g. a
     * fork created via {@link fork}), extrapolated from that branch's
     * established history and the source timeline's pending steerings.
     * @param hypothetical
     * @param targetTimelineId
     * @param count
     */
    async simulateForkFor(hypothetical: string, targetTimelineId: string, count = 3,): Promise<WhatIfBeat[]> {
      // ponytail: deterministic diff, LLM outcome generation when narrative quality demands
      // Sequential awaits: no-restricted-syntax bans Promise.all (unhandled rejection risk).
      const history = await listTimelineEntries({
        db: opts.db,
        worldId: opts.worldId,
        limit: 1000,
      },);

      const steerings = await listPendingSteerings({
        db: opts.db,
        worldId: opts.worldId,
        timelineId: targetTimelineId,
        limit: count,
      },);

      const source = history.filter(
        (row,) => (row as TimelineEntryWithTimeline).timeline_id === targetTimelineId,
      );

      const beats: WhatIfBeat[] = [];
      for (let i = 0; i < count; i++) {
        const anchor = source[i];
        const steerDesc = steerings[i]?.description;
        const anchorDesc = steerDesc ?? anchor?.description ?? "current state";
        beats.push({
          id: randomUUID(),
          timelineId: targetTimelineId,
          divergesFrom: anchor ? [anchor.id,] : [],
          description: `If ${hypothetical}, then consequence ${
            i + 1
          }/${count}: ${anchorDesc} may play out differently.`,
        },);
      }

      return beats;
    },

    /**
     * @param keyTimelineId
     * @param otherTimelineId
     */
    async diffBranches(keyTimelineId: string, otherTimelineId: string,): Promise<BranchDiff> {
      const all = (await listTimelineEntries({
        db: opts.db,
        worldId: opts.worldId,
        limit: 1000,
      },)) as TimelineEntryWithTimeline[];

      // listTimelineEntries has no timelineId option; rows from selectAll
      // carry timeline_id, so filter here by branch.
      const entriesA = all.filter((row,) => row.timeline_id === keyTimelineId);
      const entriesB = all.filter((row,) => row.timeline_id === otherTimelineId);

      const keyOf = (row: TimelineEntry,) => `${row.event_type}\u0000${row.description}\u0000${row.occurred_at}`;

      const keysA = new Set(entriesA.map(keyOf,),);
      const keysB = new Set(entriesB.map(keyOf,),);

      const shared: TimelineEntry[] = [];
      const onlyInA: TimelineEntry[] = [];
      for (const row of entriesA) {
        (keysB.has(keyOf(row,),) ? shared : onlyInA).push(row,);
      }

      const onlyInB = entriesB.filter((row,) => !keysA.has(keyOf(row,),));

      return { onlyInA, onlyInB, shared, };
    },
  };
}
