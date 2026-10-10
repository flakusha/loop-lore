// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Parser + affordance telemetry on the existing events sink.
 *
 * Wraps `src/telemetry/service.record` — no new metrics framework. Events:
 *   - `action_parser`  — one per `parseAction` outcome: which stage won,
 *     which verb matched (`null` verb = unparsed). Per-verb hit rate and
 *     parser-stage distribution derive from these rows.
 *   - `affordance_denial` — one per denied `evaluate` outcome; the denial
 *     rate is denials / total per verb, so `affordance_allow` is recorded
 *     alongside for the denominator.
 *
 * All functions are best-effort: they never throw and respect the
 * events-enabled gate.
 *
 * @module services/affordance/telemetry
 */

import type { Kysely, } from "kysely";
import type { DB, } from "../../db";
import type { ParserStage, Verb, } from "../../regex/action-parser";
import { record, } from "../../telemetry/service";

export interface ParseOutcomeEvent {
  stage: ParserStage;
  verb: Verb | null;
  confidence?: number;
}

export interface AffordanceOutcomeEvent {
  verb: Verb;
  allowed: boolean;
  reason?: string;
}

/**
 * Record one action-parse outcome.
 * @param db
 * @param event
 * @param actorId
 */
export async function recordParseOutcome(db: Kysely<DB>, event: ParseOutcomeEvent, actorId?: string,): Promise<void> {
  await record(db, {
    eventType: "action_parser",
    data: {
      stage: event.stage,
      verb: event.verb,
      confidence: event.confidence ?? null,
      actor_id: actorId ?? null,
    },
  },);
}

/**
 * Record one affordance evaluation outcome (allow or denial).
 * @param db
 * @param event
 * @param actorId
 */
export async function recordAffordanceOutcome(
  db: Kysely<DB>,
  event: AffordanceOutcomeEvent,
  actorId?: string,
): Promise<void> {
  await record(db, {
    eventType: event.allowed ? "affordance_allow" : "affordance_denial",
    data: {
      verb: event.verb,
      reason: event.reason ?? null,
      actor_id: actorId ?? null,
    },
  },);
}
