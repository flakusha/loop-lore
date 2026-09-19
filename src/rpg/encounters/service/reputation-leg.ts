// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import type { getLogger, } from "../../../logger";
import { calculateEncounterReputationChange, } from "../../../nsfw/social-integration";
import { jsonStringifyOr, } from "../../../utils";
import type { EncounterOutcome, NsfwEncounter, } from "./types";

/**
 * Persist one encounter-fan-out effect row (best-effort helper).
 *
 * Extracted so `applyOutcomes` stays readable: builds the venue- and
 * reputation-style `status_effect` rows from one call site instead of
 * repeating the insert shape. Failures propagate — callers wrap each
 * leg in try/catch so a missing auxiliary row never fails completion.
 * @param db
 * @param row
 */
export async function insertFanOutEffect(
  db: Kysely<DB>,
  row: {
    id: string;
    actorId: string;
    effectId: string;
    category: string;
    magnitude: number;
    source: string;
    sourceId: string;
    meta: string;
  },
): Promise<void> {
  await db
    .insertInto("status_effect",)
    .values({
      id: row.id,
      actor_id: row.actorId,
      effect_id: row.effectId,
      category: row.category,
      affected_stat: null,
      magnitude: row.magnitude,
      source: row.source,
      source_id: row.sourceId,
      started_at: new Date().toISOString(),
      expires_at: null,
      meta: row.meta,
    },)
    .execute();
}

/**
 * Reputation leg (TASK-042): the canonical calculator derives the delta
 * from the encounter shape; the delta persists as a status_effect row
 * (category "reputation", no expiry) — the shared ReputationScore
 * value object has no backing table, so the effect row IS the store and
 * Social/Faction replay it without bespoke wiring. Rumors derive by
 * replaying these rows, never stored twice.
 * @param db
 * @param log
 * @param encounter
 * @param outcome
 */
export async function applyReputationLeg(
  db: Kysely<DB>,
  log: ReturnType<typeof getLogger>,
  encounter: NsfwEncounter,
  outcome: EncounterOutcome,
): Promise<void> {
  try {
    const socialContext = encounter.encounterType === "public"
      ? "public"
      : encounter.encounterType === "group"
      ? "group"
      : "private";
    const success = outcome.type === "satisfaction" || outcome.type === "bonding";
    for (const participant of encounter.participants) {
      const change = calculateEncounterReputationChange(
        encounter.id,
        participant,
        success,
        socialContext,
        outcome.effects.intimacyChange,
      );
      await insertFanOutEffect(db, {
        id: `reputation:${encounter.id}:${outcome.type}:${participant}`,
        actorId: participant,
        effectId: "nsfw_reputation",
        category: "reputation",
        magnitude: change.reputationChange,
        source: "nsfw",
        sourceId: `${encounter.id}:${outcome.type}`,
        meta: jsonStringifyOr({
          event: "nsfw.reputation_changed",
          actor: participant,
          axis: socialContext,
          delta: change.reputationChange,
          reason: change.reason,
        },),
      },);
    }
    log.info(`Reputation recorded for ${encounter.id} (${outcome.type}, ${socialContext})`,);
  } catch (cause) {
    log.warn(`Reputation fan-out skipped for ${encounter.id}:`, {
      error: cause instanceof Error ? cause.message : String(cause,),
    },);
  }
}
