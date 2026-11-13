// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * repo-access/escalation-queue.ts — the admin queue over the recorded
 * escalation requests (TASK-escalation-audit-queue-with-no-auto-approve).
 *
 * A request is queued by the request path (escalation.ts); this module only
 * LISTS the queued requests and records an admin decision on one of them.
 * The decision is APPENDED as its own audit row — the recorded request is
 * never rewritten — and there is NO auto-approve for any principal: a request
 * stays denied until an admin decides on it (amendment A2).
 */
import { type Kysely, sql, } from "kysely";
import { recordToolCallAudit, } from "../../../assistant/guard/audit";
import type { DB, } from "../../../db/schema";
import { type PrincipalKind, } from "../../../middleware/principal-kind";
import {
  buildEscalationTags,
  type EscalationKey,
  latestEscalationRow,
  MARKER_DECISION,
  MARKER_REQUEST,
  parseEscalationRow,
  REPO_ACCESS_ESCALATION_TOOL,
} from "./escalation";

/** One pending escalation request, as the admin queue lists it. */
export interface PendingEscalation {
  /** The request row id (the id an admin decision addresses). */
  id: string;
  /** The subject principal's user id ("" when the credential carries none). */
  subjectId: string;
  /** The server-resolved principal kind that asked for the root change. */
  kind: PrincipalKind;
  /** The path the principal asked to escape to (recorded verbatim). */
  targetPath: string;
  /** The request's rationale (the audit trail's own wording). */
  rationale: string;
  /** When the request was recorded. */
  createdAt: string;
}

/** The decision an admin can take on one recorded request. */
export type EscalationDecision = "approve" | "deny";

/** The outcome of one admin decision — a Result, never a throw. */
export type EscalationResolution =
  | { ok: true; decision: EscalationDecision }
  | { ok: false; code: "unknown_request" | "already_decided"; message: string };

/**
 * List the escalation requests that are still waiting for an admin decision.
 * A request is pending while no later row for its key exists (an approval, a
 * denial or a redeemed approval closes it).
 * @param db - database handle
 * @returns the pending requests, oldest first
 */
export async function listPendingEscalations(db: Kysely<DB>,): Promise<PendingEscalation[]> {
  const rows = await db
    .selectFrom("tool_call_audit",)
    .select(["id", "user_id", "verdict", "rationale", "tags", "created_at",],)
    .where("tool", "=", REPO_ACCESS_ESCALATION_TOOL,)
    .where(sql<string>`json_extract(tags, '$[2]')`, "=", MARKER_REQUEST,)
    .where(
      sql<number>`NOT EXISTS (
      SELECT 1 FROM tool_call_audit d
      WHERE d.tool = ${REPO_ACCESS_ESCALATION_TOOL}
        AND d.user_id = tool_call_audit.user_id
        AND json_extract(d.tags, '$[0]') = json_extract(tool_call_audit.tags, '$[0]')
        AND json_extract(d.tags, '$[1]') = json_extract(tool_call_audit.tags, '$[1]')
        AND d.rowid > tool_call_audit.rowid
    )`,
      "=",
      1,
    )
    .orderBy("created_at", "asc",)
    .execute();

  const pending: PendingEscalation[] = [];
  for (const row of rows) {
    const state = parseEscalationRow(row,);
    if (state === null) { continue; }

    pending.push({
      id: state.id,
      subjectId: state.subjectId,
      kind: state.kind,
      targetPath: state.target,
      rationale: state.rationale,
      createdAt: state.createdAt,
    },);
  }

  return pending;
}

/**
 * Record an admin decision on one pending escalation request.
 * @param db - database handle
 * @param opts - the request id, the decision and the deciding admin
 * @returns the decision outcome (a Result, never a throw)
 */
export async function resolveEscalation(
  db: Kysely<DB>,
  opts: { id: string; decision: EscalationDecision; adminId: string },
): Promise<EscalationResolution> {
  const rows = await db
    .selectFrom("tool_call_audit",)
    .select(["id", "user_id", "verdict", "rationale", "tags", "created_at",],)
    .where("id", "=", opts.id,)
    .where("tool", "=", REPO_ACCESS_ESCALATION_TOOL,)
    .execute();

  const state = rows[0] === undefined ? null : parseEscalationRow(rows[0],);
  if (state === null || state.marker !== MARKER_REQUEST) {
    return { ok: false, code: "unknown_request", message: `escalation request "${opts.id}" is unknown`, };
  }

  const key: EscalationKey = { subjectId: state.subjectId, kind: state.kind, target: state.target, };
  const deciding = await latestEscalationRow(db, key,);
  if (deciding !== null && deciding.id !== state.id) {
    return {
      ok: false,
      code: "already_decided",
      message: `escalation request "${opts.id}" was already decided`,
    };
  }

  const approved = opts.decision === "approve";
  await recordToolCallAudit(db, {
    tool: REPO_ACCESS_ESCALATION_TOOL,
    chatId: "",
    userId: state.subjectId,
    verdict: approved ? "reviewed" : "denied",
    rationale: `escalation request "${state.id}" ${approved ? "approved" : "denied"} by ${opts.adminId}`,
    escalationAttempt: false,
    requiredRole: null,
    tags: buildEscalationTags(key, MARKER_DECISION, opts.adminId,),
    durationMs: 0,
  },);

  return { ok: true, decision: opts.decision, };
}
