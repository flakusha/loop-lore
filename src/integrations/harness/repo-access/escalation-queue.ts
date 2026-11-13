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
 *
 * The decision CLAIMS the request: its row id is derived from the request id,
 * so two admins deciding the same request race for ONE row and only one of
 * them writes it. A failed write is a FAILURE result, never a success: the
 * request stays pending and can be decided again.
 */
import { type Kysely, sql, } from "kysely";
import type { DB, } from "../../../db/schema";
import { getChildLogger, } from "../../../logger";
import { type PrincipalKind, } from "../../../middleware/principal-kind";
import { jsonStringifyOr, safeJsonStringify, } from "../../../utils";
import {
  buildEscalationTags,
  type EscalationKey,
  escalationRowId,
  type EscalationState,
  latestEscalationRow,
  MARKER_DECISION,
  MARKER_REQUEST,
  parseEscalationRow,
  REPO_ACCESS_ESCALATION_TOOL,
  writeEscalationRow,
} from "./escalation-rows";

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
  | {
    ok: false;
    code: "unknown_request" | "already_decided" | "write_failed";
    message: string;
  };

/**
 * The key one escalation row belongs to — the SAME key the request path
 * builds, so the queue and the request path agree on what one escalation is.
 * @param state - the parsed escalation row
 * @returns the key of the row
 */
function keyOfState(state: EscalationState,): EscalationKey {
  return {
    subjectId: state.subjectId,
    scope: state.scope,
    kind: state.kind,
    target: state.target,
  };
}

/**
 * The identity of one escalation key — the group of rows that share it.
 * @param key - the key
 * @returns the key's identity
 */
function keyId(key: EscalationKey,): string {
  const encoded = safeJsonStringify([key.subjectId, key.scope, key.kind, key.target,],);

  return encoded.ok ? encoded.value : "";
}

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
    .orderBy(sql`rowid asc`,)
    .execute();

  const latest = new Map<string, EscalationState>();
  for (const row of rows) {
    const state = parseEscalationRow(row,);
    if (state === null) { continue; }
    latest.set(keyId(keyOfState(state,),), state,);
  }

  const pending: PendingEscalation[] = [];
  for (const state of latest.values()) {
    if (state.marker !== MARKER_REQUEST) { continue; }
    pending.push({
      id: state.id,
      subjectId: state.subjectId,
      kind: state.kind,
      targetPath: state.target,
      rationale: state.rationale,
      createdAt: state.createdAt,
    },);
  }

  pending.sort((left, right,) => left.createdAt.localeCompare(right.createdAt,));

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

  const key = keyOfState(state,);
  const deciding = await latestEscalationRow(db, key,);
  if (deciding !== null && deciding.id !== state.id) {
    return {
      ok: false,
      code: "already_decided",
      message: `escalation request "${opts.id}" was already decided`,
    };
  }

  const approved = opts.decision === "approve";
  try {
    const claimed = await writeEscalationRow(db, {
      id: escalationRowId(MARKER_DECISION, state.id,),
      userId: key.subjectId,
      verdict: approved ? "reviewed" : "denied",
      rationale: `escalation request "${state.id}" ${approved ? "approved" : "denied"} by ${opts.adminId}`,
      escalationAttempt: 0,
      tags: jsonStringifyOr(buildEscalationTags(key, MARKER_DECISION, opts.adminId,), "{}",),
    },);

    if (!claimed) {
      return {
        ok: false,
        code: "already_decided",
        message: `escalation request "${opts.id}" was already decided`,
      };
    }
  } catch (cause) {
    getChildLogger("harness-repo-access",)?.warn("repo-access escalation decision write failed", {
      requestId: state.id,
      error: cause instanceof Error ? cause.message : String(cause,),
    },);

    return {
      ok: false,
      code: "write_failed",
      message: `the decision on escalation request "${opts.id}" could not be recorded`,
    };
  }

  return { ok: true, decision: opts.decision, };
}
