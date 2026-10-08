// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Plot Autopilot Service
 *
 * Deterministically proposes the next story beats from active quest state
 * plus recent world-timeline events. Quest-linked beats come from the
 * narrative hooks that have not been reached yet (one per active quest);
 * freeform beats (and the whole proposal when no quests are active) are
 * seeded from the most recent timeline entries.
 *
 * Beat acceptance is recorded by writing a forward event steering row
 * (`world_event_steerings` with `may_manifest`) — no dedicated table.
 */
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import type { DB, } from "../db/schema";
import { jsonParseOr, } from "../utils";
import type { QuestEngine, } from "./quest-engine";
import { createSteering, } from "./timeline/event-steering";
import { listTimelineEntries, } from "./timeline/world-timeline";

// ── Types ───────────────────────────────────────────────────

/** Proposed next beat for the story. */
export interface PlotBeat {
  id: string;
  title: string;
  description: string;
  /** Quest the beat advances, when it was drafted from quest state. */
  questId?: string;
  rationale: string;
}

/** */
export interface PlotAutopilotOptions {
  db: Kysely<DB>;
  questEngine: QuestEngine;
  worldId: string;
  /** Chat the beats are proposed for (reserved for future chat-scoped filtering). */
  chatId?: string;
}

/** */
export interface PlotAutopilotService {
  proposeBeats(count?: number,): Promise<PlotBeat[]>;
  acceptBeat(beat: PlotBeat,): Promise<void>;
}

// ── Beat drafting ───────────────────────────────────────────

/**
 * Draft one beat per pending quest milestone (progress order), then fill
 * remaining slots with beats seeded from the newest timeline entries.
 * With no active quests the timeline seeds everything.
 * @param opts
 * @param count Maximum number of beats to propose.
 * @throws {Error} When a database query fails.
 */
export async function draftBeats(opts: PlotAutopilotOptions, count = 3,): Promise<PlotBeat[]> {
  const limit = Math.max(1, Math.floor(count,),);
  const activeQuests = await opts.questEngine.getActiveQuests(opts.worldId,);

  // Narrative hooks still ahead of the quest row's progress, ordered so the
  // nearest milestone is proposed first. `narrative_hooks` is a JSON array
  // of `{ progress, narrative }` (same shape the progress dispatcher emits).
  const pending: { questId: string; questName: string; progress: number; narrative: string }[] = [];
  for (const quest of activeQuests) {
    for (
      const hook of jsonParseOr<{ progress: number; narrative: string }[]>(
        quest.narrative_hooks,
        [],
      )
    ) {
      if (hook.progress > quest.progress) {
        pending.push({
          questId: quest.id,
          questName: quest.name,
          progress: hook.progress,
          narrative: hook.narrative,
        },);
      }
    }
  }

  pending.sort((a, b,) => a.progress - b.progress);

  const questBeats: PlotBeat[] = pending.slice(0, limit,).map((hook,) => ({
    id: randomUUID(),
    title: `${hook.questName}: ${hook.narrative}`,
    description: `Advance "${hook.questName}" toward its next milestone: ${hook.narrative}`,
    questId: hook.questId,
    rationale: `Next milestone for active quest "${hook.questName}" at progress ${hook.progress}.`,
  }));

  if (questBeats.length >= limit) { return questBeats; }

  const timeline = await listTimelineEntries({
    db: opts.db,
    worldId: opts.worldId,
    limit: limit - questBeats.length,
  },);

  // Newest entries first: `listTimelineEntries` sorts ascending, the
  // freshest story state should seed the beat labels.
  const recent = [...timeline,].reverse();

  const freeformBeats: PlotBeat[] = recent.map((entry,) => ({
    id: randomUUID(),
    title: `Follow up on: ${entry.description}`,
    description: `Recent world event: ${entry.description}. Introduce a consequence or escalation flowing from it.`,
    rationale: `Seeded from timeline event at ${entry.occurred_at}.`,
  }));

  return [...questBeats, ...freeformBeats,];
}

// ── Service ─────────────────────────────────────────────────

/** */
export class PlotAutopilot implements PlotAutopilotService {
  private readonly opts: PlotAutopilotOptions;

  /**
   * @param opts
   */
  constructor(opts: PlotAutopilotOptions,) {
    this.opts = opts;
  }

  /**
   * Propose the next story beats.
   * @param count Maximum beats to return. Defaults to 3.
   * @throws {Error} When a database query fails.
   */
  async proposeBeats(count = 3,): Promise<PlotBeat[]> {
    return draftBeats(this.opts, count,);
  }

  /**
   * Record a beat acceptance as a forward event steering that may manifest.
   * Quest-linked beats keep the quest id in the steering description so the
   * acceptance record stays queryable without a dedicated table.
   * @param beat
   * @throws {Error} When the beat description is empty or the insert fails.
   */
  async acceptBeat(beat: PlotBeat,): Promise<void> {
    await createSteering({
      db: this.opts.db,
      worldId: this.opts.worldId,
      description: beat.questId
        ? `[quest:${beat.questId}] ${beat.description}`
        : beat.description,
      mayManifest: true,
      manifestProbability: 1,
    },);
  }
}

/**
 * @param opts
 */
export function createPlotAutopilot(opts: PlotAutopilotOptions,): PlotAutopilotService {
  return new PlotAutopilot(opts,);
}
