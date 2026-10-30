// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Guard audit trail — persistence for `tool_call_audit` (migration 085).
 *
 * One row per guarded tool call, written for every outcome: allowed,
 * reviewed (judge approved), and denied. Best-effort: an audit failure is
 * logged and swallowed so it never changes the guard's decision.
 */
import { type Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { getChildLogger, } from "../../logger";
import { safeJsonStringify, } from "../../utils";

/** The guard's decision about one tool call. */
export type ToolAuditVerdict = "allowed" | "denied" | "reviewed";

/** One audit row. */
export interface ToolAuditEntry {
  /** Registered command name. */
  tool: string;
  /** Chat the call happened in. */
  chatId: string;
  /** Caller's user id. */
  userId: string;
  /** The guard's decision. */
  verdict: ToolAuditVerdict;
  /** Why the guard decided as it did. */
  rationale: string;
  /** Whether the judge saw a privilege-escalation attempt. */
  escalationAttempt: boolean;
  /** The command's minimum chat role, when it declares one. */
  requiredRole?: string | null;
  /** The capability tags the decision was based on. */
  tags: string[];
  /** How long the call took, in milliseconds. */
  durationMs: number;
}

/**
 * Write one audit row for a guarded tool call. Never throws.
 * @param db - Kysely instance
 * @param entry - The row to write
 * @returns {Promise<void>}
 */
export async function recordToolCallAudit(db: Kysely<DB>, entry: ToolAuditEntry,): Promise<void> {
  try {
    const tags = safeJsonStringify(entry.tags,);
    await db
      .insertInto("tool_call_audit",)
      .values({
        tool: entry.tool,
        chat_id: entry.chatId,
        user_id: entry.userId,
        verdict: entry.verdict,
        rationale: entry.rationale,
        escalation_attempt: entry.escalationAttempt ? 1 : 0,
        required_role: entry.requiredRole ?? null,
        tags: tags.ok ? tags.value : "[]",
        duration_ms: entry.durationMs,
      },)
      .execute();
  } catch (cause) {
    getChildLogger("assistant-guard",)?.warn("tool call audit write failed (ignored)", {
      tool: entry.tool,
      verdict: entry.verdict,
      error: cause instanceof Error ? cause.message : String(cause,),
    },);
  }
}
