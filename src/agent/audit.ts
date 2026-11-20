// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shared sink for the RSI agent-actions audit trail (RSI #9).
 *
 * The caller passes only a 16-char SHA-256 digest — a raw bearer token must
 * never reach this module. Writes are best-effort: an audit failure is logged
 * and swallowed so observability can never fail an agent request.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { getChildLogger, } from "../logger";

/** Stored in `token_digest` when a request carries no bearer token. */
export const NO_AGENT_TOKEN_DIGEST = "none";

/** Options for {@link recordAgentAction}. */
export interface RecordAgentActionOptions {
  /** First 16 hex chars of the bearer SHA-256 (or NO_AGENT_TOKEN_DIGEST). */
  tokenDigest: string;
  action: string;
  result: string;
  userId?: string | null;
  worktreeId?: string | null;
  commitHash?: string | null;
  durationMs?: number | null;
  metadata?: string | null;
}

/** Handed from the auth guard to the router's completion hooks. */
export interface AgentActionMarker {
  auditId: number;
  startedAt: number;
}

/** Options for {@link finalizeAgentAction}. */
export interface FinalizeAgentActionOptions {
  auditId: number;
  result: string;
  durationMs: number;
}

/**
 * Insert one agent-action row.
 * @param database - Kysely handle
 * @param options - digest-prefixed identity and the observed outcome
 * @returns the inserted row id, or null when the best-effort write failed
 */
export async function recordAgentAction(
  database: Kysely<DB>,
  options: RecordAgentActionOptions,
): Promise<number | null> {
  try {
    const row = await database
      .insertInto("agent_actions",)
      .values({
        token_digest: options.tokenDigest,
        action: options.action,
        result: options.result,
        user_id: options.userId ?? null,
        worktree_id: options.worktreeId ?? null,
        commit_hash: options.commitHash ?? null,
        duration_ms: options.durationMs ?? null,
        metadata: options.metadata ?? null,
      },)
      .returning("id",)
      .executeTakeFirst();

    return row?.id ?? null;
  } catch (error) {
    getChildLogger("agent.audit",)?.error(
      "agent action audit write failed",
      error instanceof Error ? error : undefined,
    );

    return null;
  }
}

/**
 * Stamp the final handler outcome onto a row written by the auth guard.
 * @param database - Kysely handle
 * @param options - inserted row id, final result and elapsed milliseconds
 */
export async function finalizeAgentAction(
  database: Kysely<DB>,
  options: FinalizeAgentActionOptions,
): Promise<void> {
  try {
    await database
      .updateTable("agent_actions",)
      .set({ result: options.result, duration_ms: options.durationMs, },)
      .where("id", "=", options.auditId,)
      .execute();
  } catch (error) {
    getChildLogger("agent.audit",)?.error(
      "agent action audit finalization failed",
      error instanceof Error ? error : undefined,
    );
  }
}
