// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * repo-access/escalation-rows.ts — the escalation vocabulary and the audit
 * rows it is stored in (TASK-escalation-audit-queue-with-no-auto-approve).
 *
 * KEY — one key is (credential-scoped subject, principal kind, target path).
 * The subject is the CREDENTIAL-SCOPED identity the auth seam resolved: the
 * credential id, the agent worktree and the user id. Two principals that
 * share a user id but not a credential are two different subjects. A
 * principal that carries NO identity at all is REFUSED (never queued): two
 * anonymous principals must never share one approval.
 *
 * STATE — every row for a key is appended, so the LAST row decides the key:
 *   "request"  — a recorded request (denied; escalation_attempt = 1)
 *   "decision" — an admin decision ("reviewed" = approved, "denied" = denied)
 *   "used"     — an approval that was redeemed (verdict "allowed")
 * A key whose last row is a "request" is PENDING; a key whose last row is an
 * approved "decision" GRANTS the root change; a redeemed approval ("used")
 * and a denial both close the key until the next request re-opens it.
 *
 * CLAIM — the redemption and the decision are claimed by ONE insert with a
 * deterministic row id and `on conflict do nothing`: the loser of a race
 * writes nothing and is DENIED. A failed write DENIES as well: a root change
 * is never granted without the row that records the grant.
 *
 * The rows live in the EXISTING `tool_call_audit` table under their own tool
 * name — no new table (amendment A7) — and are append-only: a decision is a
 * NEW row, never an UPDATE of the request.
 */
import { type Kysely, sql, } from "kysely";
import { createHash, } from "node:crypto";
import type { DB, } from "../../../db/schema";
import { type PrincipalKind, toPrincipalKind, } from "../../../middleware/principal-kind";
import { jsonParseOr, } from "../../../utils";
import { type RepoAccessPrincipal, } from "./principal-scope";

/** The audit tool the escalation queue's rows are recorded under. */
export const REPO_ACCESS_ESCALATION_TOOL = "harness.repo-access.escalation";

/** Row marker: a recorded request awaiting an admin decision. */
export const MARKER_REQUEST = "request";
/** Row marker: an admin decision (approve or deny). */
export const MARKER_DECISION = "decision";
/** Row marker: an approval that was redeemed by a request. */
export const MARKER_USED = "used";
/** Row marker: a request refused by the rate limiter. */
export const MARKER_RATE_LIMITED = "rate-limited";

/** The key one escalation row belongs to. */
export interface EscalationKey {
  /** The attributed user id ("" when the credential carries none). */
  subjectId: string;
  /** The credential-scoped identity the approval is bound to (never empty). */
  scope: string;
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
  scope: string;
  kind: PrincipalKind;
  target: string;
  marker: string;
  verdict: string;
  rationale: string;
  adminId: string;
  createdAt: string;
}

/** The tags of one escalation row — a JSON object, one field per name. */
export interface EscalationTags {
  /** The path the principal asked to escape to. */
  target: string;
  /** The server-resolved principal kind. */
  kind: string;
  /** The row marker (request | decision | used | rate-limited). */
  marker: string;
  /** The credential-scoped identity the row belongs to (never empty). */
  scope: string;
  /** The deciding admin (decision rows only). */
  adminId?: string;
}

/** One escalation row to append. */
export interface EscalationRowWrite {
  /** The deterministic row id — the claim itself. */
  id: string;
  /** The attributed user id. */
  userId: string;
  /** The row's verdict. */
  verdict: string;
  /** Why the row was written. */
  rationale: string;
  /** The escalation-attempt counter (1 for a recorded request). */
  escalationAttempt: 0 | 1;
  /** The row's tags (JSON). */
  tags: string;
}

/**
 * Parse one escalation row's tags. A corrupt or foreign tags value fails
 * closed (null) instead of throwing.
 * @param raw - the raw tags column
 * @returns the parsed tags, or null when the value is unusable
 */
function parseEscalationTags(raw: string,): EscalationTags | null {
  const parsed = jsonParseOr<Record<string, string>>(raw, {},);
  const target = parsed["target"];
  const kind = parsed["kind"];
  const marker = parsed["marker"];
  const scope = parsed["scope"];
  if (
    typeof target !== "string" ||
    typeof kind !== "string" ||
    typeof marker !== "string" ||
    typeof scope !== "string"
  ) { return null; }

  const tags: EscalationTags = { target, kind, marker, scope, };
  const adminId = parsed["adminId"];
  if (typeof adminId === "string") { tags.adminId = adminId; }

  return tags;
}

/**
 * Parse one escalation row into the queue's vocabulary.
 * @param row - the raw audit row
 * @returns the parsed state, or null when the row is unusable (a tampered
 *   kind or a corrupt tags value fails closed instead of being listed or
 *   granted)
 */
export function parseEscalationRow(row: EscalationRow,): EscalationState | null {
  const tags = parseEscalationTags(row.tags,);
  if (tags === null) { return null; }
  const kind = toPrincipalKind(tags.kind,);
  if (kind === null) { return null; }

  return {
    id: row.id,
    subjectId: row.user_id,
    scope: tags.scope,
    kind,
    target: tags.target,
    marker: tags.marker,
    verdict: row.verdict,
    rationale: row.rationale,
    adminId: tags.adminId ?? "",
    createdAt: row.created_at,
  };
}

/**
 * Build the tags of one escalation row.
 * @param key - the key the row belongs to
 * @param marker - the row's marker
 * @param adminId - the deciding admin (decision rows only)
 * @returns the tags of the row
 */
export function buildEscalationTags(
  key: EscalationKey,
  marker: string,
  adminId?: string,
): EscalationTags {
  const tags: EscalationTags = {
    target: key.target,
    kind: key.kind,
    marker,
    scope: key.scope,
  };

  if (adminId !== undefined) { tags.adminId = adminId; }

  return tags;
}

/**
 * The deterministic id of a claimed escalation row. Two writers that claim
 * the same row compute the same id, so the second insert conflicts and
 * writes nothing.
 * @param purpose - the claim's purpose (decision | used)
 * @param id - the id the claim is derived from
 * @returns the 32-hex row id
 */
export function escalationRowId(purpose: string, id: string,): string {
  return createHash("sha256",).update(`${purpose}:${id}`,).digest("hex",).slice(0, 32,);
}

/**
 * The credential-scoped identity of a principal — the subject an approval is
 * bound to. EMPTY when the principal carries no identity: such a principal
 * is refused instead of sharing another principal's approval.
 * @param principal - the server-resolved principal
 * @returns the scope, or "" when the principal carries no identity
 */
export function escalationScope(principal: RepoAccessPrincipal,): string {
  const credentialId = principal.credentialId ?? "";
  const agentWorktree = principal.agentWorktree ?? "";
  const userId = principal.userId ?? "";
  const parts: string[] = [];
  if (credentialId !== "") { parts.push(`cred:${credentialId}`,); }
  if (agentWorktree !== "") { parts.push(`wt:${agentWorktree}`,); }
  if (userId !== "") { parts.push(`user:${userId}`,); }
  if (parts.length === 0) { return ""; }
  // An external agent's user id is the ISSUER's: without a credential id or
  // an assigned worktree the scope is not agent-specific.
  if (principal.kind === "external-agent" && credentialId === "" && agentWorktree === "") { return ""; }

  return parts.join("|",);
}

/**
 * The key one principal's escalation rows belong to.
 * @param principal - the server-resolved principal
 * @param target - the path the principal asked to escape to
 * @returns the key, or null when the principal carries no identity to key on
 */
export function buildEscalationKey(
  principal: RepoAccessPrincipal,
  target: string,
): EscalationKey | null {
  const scope = escalationScope(principal,);
  if (scope === "") { return null; }

  return { subjectId: principal.userId ?? "", scope, kind: principal.kind, target, };
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
    .orderBy(sql`rowid desc`,)
    .execute();

  for (const row of rows) {
    const state = parseEscalationRow(row,);
    if (state === null) { continue; }
    if (state.scope === key.scope && state.kind === key.kind && state.target === key.target) {
      return state;
    }
  }

  return null;
}

/**
 * Append one escalation row, claiming its deterministic id. The insert IS the
 * claim: `on conflict do nothing` leaves a second claim of the same row
 * without a row, and the caller denies.
 * @param db - database handle
 * @param row - the row to append
 * @returns true when the row was written, false when the claim was lost
 */
export async function writeEscalationRow(
  db: Kysely<DB>,
  row: EscalationRowWrite,
): Promise<boolean> {
  const written = await db
    .insertInto("tool_call_audit",)
    .values({
      id: row.id,
      tool: REPO_ACCESS_ESCALATION_TOOL,
      chat_id: "",
      user_id: row.userId,
      verdict: row.verdict,
      rationale: row.rationale,
      escalation_attempt: row.escalationAttempt,
      required_role: null,
      tags: row.tags,
      duration_ms: 0,
    },)
    .onConflict((oc,) => oc.column("id",).doNothing())
    .executeTakeFirst();

  return Number(written?.numInsertedOrUpdatedRows ?? 0,) > 0;
}
