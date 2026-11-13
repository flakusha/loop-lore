// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * repo-access/escalation.ts — the escalation request path and the state its
 * audit rows carry (TASK-escalation-audit-queue-with-no-auto-approve).
 *
 * A root-change (escalation) request is RECORDED in `tool_call_audit` and
 * REFUSED. There is NO auto-approve for any principal (amendment A2): only an
 * admin approval (escalation-queue.ts) lets a later request through, and that
 * approval is consumed by the request that redeems it.
 *
 * STATE — one key is (subject principal, principal kind, target path). Every
 * row for a key is appended, so the LAST row decides the key:
 *   "request"  — a recorded request (denied; escalation_attempt = 1)
 *   "decision" — an admin decision ("reviewed" = approved, "denied" = denied)
 *   "used"     — an approval that was redeemed (verdict "allowed")
 * A key whose last row is a "request" is PENDING; a key whose last row is an
 * approved "decision" GRANTS the root change; a redeemed approval ("used")
 * and a denial both close the key until the next request re-opens it.
 *
 * The rows live in the EXISTING `tool_call_audit` table under their own tool
 * name — no new table (amendment A7) — and are append-only: a decision is a
 * NEW row, never an UPDATE of the request.
 */
import { type Kysely, sql, } from "kysely";
import { randomUUID, } from "node:crypto";
import { governanceRateLimiter, } from "../../../api-governance/rate-limiting/instance";
import { type RatePolicy, repoAccessPolicy, } from "../../../api-governance/rate-limiting/policies";
import { recordToolCallAudit, } from "../../../assistant/guard/audit";
import type { DB, } from "../../../db/schema";
import { getChildLogger, } from "../../../logger";
import { type PrincipalKind, toPrincipalKind, } from "../../../middleware/principal-kind";
import { jsonStringifyOr, parseJsonList, } from "../../../utils";
import { type RepoAccessPrincipal, } from "./principal-scope";

/** The audit tool the escalation queue's rows are recorded under. */
export const REPO_ACCESS_ESCALATION_TOOL = "harness.repo-access.escalation";

/** Row marker: a recorded request awaiting an admin decision. */
export const MARKER_REQUEST = "request";
/** Row marker: an admin decision (approve or deny). */
export const MARKER_DECISION = "decision";
/** Row marker: an approval that was redeemed by a request. */
export const MARKER_USED = "used";

/** The tags layout of one escalation row: [target, kind, marker, adminId?]. */
const TAGS_TARGET = 0;
const TAGS_KIND = 1;
const TAGS_MARKER = 2;

/** The minimal limiter surface the request path needs (tests inject their own). */
export interface EscalationRateLimiter {
  consume(key: string, policy: RatePolicy,): { allowed: boolean; retryAfterSec?: number };
}

/** The outcome of one root-change request — a Result, never a throw. */
export type RepoRootChangeOutcome =
  | { ok: true; root: string }
  | {
    ok: false;
    code: "escalation_denied" | "escalation_rate_limited";
    message: string;
    /** The recorded request id — the queue entry an admin decides on. */
    requestId?: string;
  };

/** Inputs for {@link requestRepoRootChange}. */
export interface RepoRootChangeInput {
  /** The SERVER-RESOLVED principal requesting the root change. */
  principal: RepoAccessPrincipal;
  /** The path the caller asked to escape to (recorded verbatim). */
  targetPath: string;
  /** Database handle — the request is recorded in tool_call_audit. */
  db: Kysely<DB>;
  /** Limiter override; the process-wide governance limiter by default. */
  limiter?: EscalationRateLimiter;
}

/** The key one escalation row belongs to. */
export interface EscalationKey {
  /** The subject principal's user id ("" when the credential carries none). */
  subjectId: string;
  /** The server-resolved principal kind. */
  kind: string;
  /** The path the principal asked to escape to. */
  target: string;
}

/** One escalation row, read back from tool_call_audit. */
export interface EscalationRow {
  id: string;
  user_id: string;
  verdict: string;
  rationale: string;
  tags: string;
  created_at: string;
}

/** One escalation row, parsed into the queue's vocabulary. */
export interface EscalationState {
  id: string;
  subjectId: string;
  kind: PrincipalKind;
  target: string;
  marker: string;
  verdict: string;
  rationale: string;
  createdAt: string;
}

/**
 * Parse one escalation row's tags into the queue's vocabulary.
 * @param row - the raw audit row
 * @returns the parsed state, or null when the row is unusable (a tampered
 *   kind fails closed instead of being listed or granted)
 */
export function parseEscalationRow(row: EscalationRow,): EscalationState | null {
  const tags = parseJsonList(row.tags,);
  const kind = toPrincipalKind(tags[TAGS_KIND] ?? "",);
  if (kind === null) { return null; }

  return {
    id: row.id,
    subjectId: row.user_id,
    kind,
    target: tags[TAGS_TARGET] ?? "",
    marker: tags[TAGS_MARKER] ?? "",
    verdict: row.verdict,
    rationale: row.rationale,
    createdAt: row.created_at,
  };
}

/**
 * Build the tags of one escalation row.
 * @param key - the key the row belongs to
 * @param marker - the row's marker
 * @param adminId - the deciding admin (decision rows only)
 * @returns the JSON tags
 */
export function buildEscalationTags(
  key: EscalationKey,
  marker: string,
  adminId?: string,
): string[] {
  const tags: string[] = [key.target, key.kind, marker,];
  if (adminId !== undefined) { tags.push(adminId,); }

  return tags;
}

/**
 * Read the LAST escalation row for one key — the row that decides the key.
 * @param db - database handle
 * @param key - the key to look up
 * @returns the deciding row, or null when the key has no rows yet
 */
export async function latestEscalationRow(
  db: Kysely<DB>,
  key: EscalationKey,
): Promise<EscalationState | null> {
  const rows = await db
    .selectFrom("tool_call_audit",)
    .select(["id", "user_id", "verdict", "rationale", "tags", "created_at",],)
    .where("tool", "=", REPO_ACCESS_ESCALATION_TOOL,)
    .where("user_id", "=", key.subjectId,)
    .where(sql<string>`json_extract(tags, '$[0]')`, "=", key.target,)
    .where(sql<string>`json_extract(tags, '$[1]')`, "=", key.kind,)
    .orderBy(sql`rowid desc`,)
    .limit(1,)
    .execute();

  const row = rows[0];
  if (row === undefined) { return null; }

  return parseEscalationRow(row,);
}

/**
 * Record an audited root-change (escalation) request. DEFAULT DENY: the
 * request is written to `tool_call_audit` and refused unless an admin has
 * approved this key — there is NO auto-approve for any principal, and an
 * approval is consumed by the request that redeems it.
 * @param input - principal, target path, db handle, optional limiter
 * @returns the outcome (a Result, never a throw)
 */
export async function requestRepoRootChange(
  input: RepoRootChangeInput,
): Promise<RepoRootChangeOutcome> {
  const subjectId = input.principal.userId ?? "";
  const key: EscalationKey = {
    subjectId,
    kind: input.principal.kind,
    target: input.targetPath,
  };

  const deciding = await latestEscalationRow(input.db, key,);

  // An approval for this key grants ONE root change; redeeming it closes the
  // key (the "used" row is the key's last row from now on).
  if (deciding !== null && deciding.marker === MARKER_DECISION && deciding.verdict === "reviewed") {
    await recordToolCallAudit(input.db, {
      tool: REPO_ACCESS_ESCALATION_TOOL,
      chatId: "",
      userId: subjectId,
      verdict: "allowed",
      rationale: `approved root change to "${input.targetPath}" redeemed`,
      escalationAttempt: false,
      requiredRole: null,
      tags: buildEscalationTags(key, MARKER_USED,),
      durationMs: 0,
    },);

    return { ok: true, root: input.targetPath, };
  }

  // A request that is already pending is idempotent: it re-answers with the
  // recorded request id instead of queueing a second one.
  if (deciding !== null && deciding.marker === MARKER_REQUEST) {
    return {
      ok: false,
      code: "escalation_denied",
      message: `root change to "${input.targetPath}" is awaiting an admin decision`,
      requestId: deciding.id,
    };
  }

  const limiter = input.limiter ?? governanceRateLimiter;
  const verdict = limiter.consume(
    `repo-access:escalation:${key.kind}:${subjectId === "" ? "anonymous" : subjectId}`,
    repoAccessPolicy,
  );

  if (!verdict.allowed) {
    getChildLogger("harness-repo-access",)?.warn("repo-access escalation request refused", {
      kind: key.kind,
      subjectId,
      retryAfterSec: verdict.retryAfterSec ?? null,
    },);

    await recordToolCallAudit(input.db, {
      tool: REPO_ACCESS_ESCALATION_TOOL,
      chatId: "",
      userId: subjectId,
      verdict: "denied",
      rationale: `root change to "${input.targetPath}" refused (rate limit)`,
      escalationAttempt: false,
      requiredRole: null,
      tags: buildEscalationTags(key, "rate-limited",),
      durationMs: 0,
    },);

    return {
      ok: false,
      code: "escalation_rate_limited",
      message: `root change to "${input.targetPath}" is rate limited`,
    };
  }

  const id = randomUUID();
  await input.db
    .insertInto("tool_call_audit",)
    .values({
      id,
      tool: REPO_ACCESS_ESCALATION_TOOL,
      chat_id: "",
      user_id: subjectId,
      verdict: "denied",
      rationale: `root change requested to "${input.targetPath}" — recorded, default-deny`,
      escalation_attempt: 1,
      required_role: null,
      tags: jsonStringifyOr(buildEscalationTags(key, MARKER_REQUEST,), "[]",),
      duration_ms: 0,
    },)
    .execute();

  return {
    ok: false,
    code: "escalation_denied",
    message: `root change to "${input.targetPath}" was recorded and denied (default deny; no auto-approve)`,
    requestId: id,
  };
}
