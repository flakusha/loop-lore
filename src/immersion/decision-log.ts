// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Immersion Gate — decision-log audit writer (WI-6).
 *
 * Append-only audit over `immersion_decision_log` (migration 083): one row
 * per gate decision recording input claims, actor state snapshot, verdict,
 * severity, and engine attribution. Best-effort: an audit failure is logged
 * and swallowed so it never blocks or changes the gate decision (mirrors
 * the growth-log audit pattern).
 */
import { type Kysely, } from "kysely";

import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import { safeJsonStringify, } from "../utils";
import type { GateVerdict, } from "./types";

/** Where a logged decision originated. */
export type ImmersionDecisionSource = "pregeneration" | "hook" | "classifier";

/** Arguments for {@link recordImmersionDecision}. */
export interface RecordImmersionDecisionArgs {
  readonly chatId: string;
  readonly actorId: string;
  readonly source: ImmersionDecisionSource;
  /** The full gate verdict (claims + snapshot + findings). */
  readonly verdict: GateVerdict;
}

/**
 * Write one audit row for a gate decision. Never throws.
 * @param {Kysely<DB>} db
 * @param {RecordImmersionDecisionArgs} args
 * @returns {Promise<void>}
 */
export async function recordImmersionDecision(
  db: Kysely<DB>,
  args: RecordImmersionDecisionArgs,
): Promise<void> {
  try {
    const claims = safeJsonStringify(args.verdict.claims,);
    const snapshot = safeJsonStringify(args.verdict.stateSnapshot,);
    const verdictJson = safeJsonStringify({
      severity: args.verdict.severity,
      ruleId: args.verdict.ruleId,
      findings: args.verdict.findings,
    },);

    await db
      .insertInto("immersion_decision_log",)
      .values({
        chat_id: args.chatId,
        actor_id: args.actorId,
        source: args.source,
        severity: args.verdict.severity,
        rule_id: args.verdict.ruleId,
        engine: args.verdict.engine,
        claims: claims.ok ? claims.value : "[]",
        state_snapshot: snapshot.ok ? snapshot.value : "{}",
        verdict: verdictJson.ok ? verdictJson.value : "{}",
      },)
      .execute();
  } catch (cause) {
    try {
      getLogger().child({ module: "immersion-gate", },).warn("decision-log write failed (ignored)", {
        chatId: args.chatId,
        actorId: args.actorId,
        source: args.source,
        error: cause instanceof Error ? cause.message : String(cause,),
      },);
    } catch {
      // Logging must never fail the decision.
    }
  }
}
