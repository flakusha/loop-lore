// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import { uid, } from "../utils";
import { getActiveEffects, } from "./status-effects";
import type { EncounterOutcome, } from "./encounters/service/types";

/**
 * Trauma / recovery service (TASK-044).
 *
 * Trauma is a shared `StatusEffect` family (`category: "trauma"`, effect
 * ids `trauma_sev1` … `trauma_sev4`): NO private trauma store. Severity
 * derives from the `nsfw.encounter_completed` outcome (satisfaction /
 * bonding = none, dissatisfaction = mild-moderate, injury = severe) —
 * never from free-form LLM judgment. Recovery is time-driven via the
 * shared sweep (`nsfw.status-sweep`, `sweepExpiredEffects`): each severity
 * sets a longer `expires_at` (1 / 3 / 7 / 14 days). Non-consensual
 * encounters escalate one severity step via the violation path from
 * TASK-033's consent gate (see `escalateViolation`) — never skip recovery.
 */

/** Trauma severity ladder (0 = none, no row written). */
export type TraumaSeverity = 0 | 1 | 2 | 3 | 4;

const EFFECT_BY_SEVERITY: Record<Exclude<TraumaSeverity, 0>, string> = {
  1: "trauma_sev1",
  2: "trauma_sev2",
  3: "trauma_sev3",
  4: "trauma_sev4",
};

/** Recovery lifetime per severity (seconds): 1 / 3 / 7 / 14 days. */
const RECOVERY_SECONDS: Record<Exclude<TraumaSeverity, 0>, number> = {
  1: 86_400,
  2: 259_200,
  3: 604_800,
  4: 1_209_600,
};

/**
 * Derive trauma severity from an encounter outcome.
 *
 * Satisfaction/bonding → 0 (no trauma). Dissatisfaction → 1, or 2 when
 * the mood delta is deeply negative. Injury → 3. `nonConsensual`
 * escalates one step (capped at 4) — the violation path.
 * @param outcome
 * @param nonConsensual
 */
export function severityFromOutcome(
  outcome: Pick<EncounterOutcome, "type" | "effects">,
  nonConsensual = false,
): TraumaSeverity {
  let severity: TraumaSeverity;
  switch (outcome.type) {
    case "injury":
      severity = 3;
      break;
    case "dissatisfaction":
      severity = outcome.effects.moodChange <= -5 ? 2 : 1;
      break;
    case "satisfaction":
    case "bonding":
    case "discovery":
      severity = 0;
      break;
  }
  if (nonConsensual && severity < 4) {
    severity = (severity + 1) as TraumaSeverity;
  }
  return severity;
}

/** */
export class TraumaService {
  /**
   * @param db
   */
  constructor(private readonly db: Kysely<DB>,) {}

  /**
   * Apply trauma at a severity (0 = no-op, returns null). Writes one
   * shared `trauma` row; recovery time is the row's `expires_at`.
   * @param actorId
   * @param severity
   * @param sourceId - encounter id for provenance
   */
  async applyTrauma(
    actorId: string,
    severity: TraumaSeverity,
    sourceId?: string,
  ): Promise<string | null> {
    if (severity === 0) { return null; }
    const now = new Date();
    const id = `trauma:${actorId}:${uid()}`;
    await this.db
      .insertInto("status_effect",)
      .values({
        id,
        actor_id: actorId,
        effect_id: EFFECT_BY_SEVERITY[severity],
        category: "trauma",
        affected_stat: null,
        magnitude: severity,
        source: "trauma",
        source_id: sourceId ?? null,
        started_at: now.toISOString(),
        expires_at: new Date(now.getTime() + RECOVERY_SECONDS[severity] * 1000,).toISOString(),
        meta: null,
      },)
      .execute();
    getLogger().child({ module: "trauma", },)
      .info(`Trauma applied: sev${severity} → ${actorId}`,);
    return id;
  }

  /**
   * Derive severity from an encounter outcome and apply it.
   * Convenience for the encounter completion path.
   * @param actorId
   * @param outcome
   * @param nonConsensual
   * @param sourceId
   */
  async applyFromOutcome(
    actorId: string,
    outcome: Pick<EncounterOutcome, "type" | "effects">,
    nonConsensual = false,
    sourceId?: string,
  ): Promise<string | null> {
    return this.applyTrauma(actorId, severityFromOutcome(outcome, nonConsensual,), sourceId,);
  }

  /**
   * Escalate one severity step for a consent violation (TASK-033 gate
   * denial → trauma, not intimacy gain). Reads the actor's current max
   * active severity and applies max+1 (capped at 4). No active trauma →
   * applies sev1 as the violation baseline.
   * @param actorId
   * @param sourceId - gate/encounter id for provenance
   */
  async escalateViolation(actorId: string, sourceId?: string,): Promise<string> {
    const active = await getActiveEffects(this.db, actorId, { category: "trauma", },);
    const current = active.reduce((max, e,) => Math.max(max, e.magnitude,), 0,);
    const next = Math.min(4, current + 1,) as Exclude<TraumaSeverity, 0>;
    return (await this.applyTrauma(actorId, next, sourceId,)) as string;
  }

  /**
   * Advance recovery: delete trauma rows whose `expires_at` has passed
   * for this actor (the shared sweep handles global expiry; this is the
   * per-actor explicit step). Returns rows cleared.
   * @param actorId
   */
  async advanceRecovery(actorId: string,): Promise<number> {
    const now = new Date().toISOString();
    const result = await this.db
      .deleteFrom("status_effect",)
      .where("actor_id", "=", actorId,)
      .where("category", "=", "trauma",)
      .where("expires_at", "is not", null,)
      .where("expires_at", "<=", now,)
      .executeTakeFirst();
    return Number(result.numDeletedRows ?? 0n,);
  }

  /**
   * Current trauma status: active rows (highest severity first).
   * @param actorId
   */
  async getStatus(actorId: string,): Promise<{
    severity: number;
    effects: { effectId: string; magnitude: number; expiresAt: string | null }[];
  }> {
    const active = await getActiveEffects(this.db, actorId, { category: "trauma", },);
    const severity = active.reduce((max, e,) => Math.max(max, e.magnitude,), 0,);
    return {
      severity,
      effects: active.map((e,) => ({
        effectId: e.effectId,
        magnitude: e.magnitude,
        expiresAt: e.expiresAt,
      }),),
    };
  }
}
