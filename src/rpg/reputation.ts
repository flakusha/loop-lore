// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import { uid, } from "../utils";
import {
  applyReputationChange as applyCanonicalChange,
  createReputationScore as createCanonicalScore,
  getReputationTier,
  type ReputationScore,
  type ReputationSource,
} from "../schemas/reputation";
import { calculateEncounterReputationChange, } from "../nsfw/social-integration";
import { getActiveEffects, } from "./status-effects";

/**
 * NSFW reputation service (TASK-042).
 *
 * Reputation writes target the shared `ReputationScore` value object
 * (`src/schemas/reputation.ts`, owned by Social/Faction) — there is NO
 * NSFW-private reputation table. Durable per-actor state is the existing
 * `status_effect` fan-out rows (`category: "reputation"`, written by the
 * encounter completion path): `getScore` replays those rows through the
 * canonical calculator, so Social/Faction see the same deltas without
 * bespoke wiring. The `nsfw.reputation_changed` payload
 * `{actor, axis, delta, source}` travels in the row meta — consumers
 * replay rows, rumors derive from the same replay, never stored twice.
 * Public perception uses `calculateEncounterReputationChange`, the same
 * publish path as non-NSFW reputation events. Per-character deltas only —
 * never collapsed into a global faction score (Open Q9).
 */

export interface ReputationChangedPayload {
  actor: string;
  axis: string;
  delta: number;
  source: string;
}

/** */
export class ReputationService {
  /**
   * @param db
   */
  constructor(private readonly db: Kysely<DB>,) {}

  /**
   * Apply a reputation delta: folds it into the shared `ReputationScore`
   * (returned) and persists one `status_effect` row so the delta survives
   * and replays for Social/Faction/rumors.
   * @param actorId
   * @param source - provenance label (encounter id, `manual:...`, ...)
   * @param delta
   * @param axis - social context axis (`private` | `public` | `group`)
   */
  async applyDelta(
    actorId: string,
    source: string,
    delta: number,
    axis: "private" | "public" | "group" = "private",
  ): Promise<ReputationScore> {
    const current = await this.getScore(actorId, axis,);
    const next = applyCanonicalChange(current, delta, source, {
      actor_id: actorId,
      axis,
      source,
    },);
    await this.db
      .insertInto("status_effect",)
      .values({
        id: uid(),
        actor_id: actorId,
        effect_id: "nsfw_reputation",
        category: "reputation",
        affected_stat: null,
        magnitude: delta,
        source: "nsfw",
        source_id: source,
        started_at: new Date().toISOString(),
        expires_at: null,
        meta: JSON.stringify({
          event: "nsfw.reputation_changed",
          actor: actorId,
          axis,
          delta,
          source,
        } satisfies ReputationChangedPayload & { event: string },),
      },)
      .execute();
    getLogger().child({ module: "reputation", },)
      .info(`Reputation delta: ${actorId} ${delta > 0 ? "+" : ""}${delta} (${axis})`,);
    return next;
  }

  /**
   * Current score on an axis: replays the actor's `reputation` rows
   * (ordered by `started_at`) through the canonical calculator from a
   * zero baseline. Source is `nsfw` — Social/Faction branch on the row
   * meta, not on this value object.
   * @param actorId
   * @param axis
   * @param source
   */
  async getScore(
    actorId: string,
    axis: "private" | "public" | "group" = "private",
    source: ReputationSource = "nsfw",
  ): Promise<ReputationScore> {
    let score = createCanonicalScore({ source, });
    const rows = await getActiveEffects(this.db, actorId, { category: "reputation", },);
    const axisRows = [] as typeof rows;
    for (const row of rows) {
      try {
        const meta = row.meta ? JSON.parse(row.meta,) as { axis?: unknown } : {};
        if (meta.axis === undefined || meta.axis === axis) { axisRows.push(row,); }
      } catch {
        axisRows.push(row,);
      }
    }
    axisRows.sort((a, b,) => a.startedAt.localeCompare(b.startedAt,),);
    for (const row of axisRows) {
      score = applyCanonicalChange(score, row.magnitude, row.sourceId ?? row.source, {
        actor_id: actorId,
        axis,
        effect_id: row.id,
      },);
    }
    return { ...score, tier: getReputationTier(score.value,), };
  }

  /**
   * Rumor derivation (TASK-042): replays reputation rows through the
   * canonical encounter calculator shape — rumors are derived text, never
   * stored rows. Returns one rumor string per qualifying row (public /
   * group axes, or deltas with |delta| ≥ 10).
   * @param actorId
   */
  async deriveRumors(actorId: string,): Promise<string[]> {
    const rows = await getActiveEffects(this.db, actorId, { category: "reputation", },);
    const rumors: string[] = [];
    for (const row of rows) {
      let axis = "private";
      let reason = row.sourceId ?? row.source;
      try {
        const meta = row.meta ? JSON.parse(row.meta,) as { axis?: unknown; reason?: unknown } : {};
        if (typeof meta.axis === "string") { axis = meta.axis; }
        if (typeof meta.reason === "string") { reason = meta.reason; }
      } catch {
        // fall through with defaults
      }
      if (axis === "public" || axis === "group" || Math.abs(row.magnitude,) >= 10) {
        const tone = row.magnitude >= 0 ? "fondly" : "darkly";
        rumors.push(`They speak ${tone} of ${actorId} (${axis}, ${reason})`,);
      }
    }
    return rumors;
  }

  /**
   * Public-perception entry point: same publish path as non-NSFW
   * reputation — the canonical encounter calculator derives the delta,
   * `applyDelta` persists + replays it.
   * @param encounterId
   * @param actorId
   * @param success
   * @param socialContext
   * @param intimacyLevel
   */
  async applyEncounterReputation(
    encounterId: string,
    actorId: string,
    success: boolean,
    socialContext: "public" | "private" | "group",
    intimacyLevel: number,
  ): Promise<ReputationScore> {
    const change = calculateEncounterReputationChange(
      encounterId, actorId, success, socialContext, intimacyLevel,
    );
    return this.applyDelta(actorId, `${encounterId}:${change.reason}`, change.reputationChange, socialContext,);
  }
}
