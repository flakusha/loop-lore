// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 114_rsi_agent_tokens
 *
 * RSI agent API credentials (TASK-recursive-self-improvement-agent-api-router-
 * and-token-scope-): one row per admin-minted bearer token for the
 * `/api/v1/agent/*` surface.
 *
 *  - token_hash holds ONLY the SHA-256 hex of the raw token (unique — the
 *    hash lookup IS the credential check); the plaintext is shown exactly
 *    once at mint time and never persisted (same at-rest contract as
 *    097_integration_tokens).
 *  - scope is the granted capability tier (`agent:worktree`, `agent:check`,
 *    `agent:commit`, `agent:finalize`), CHECK-constrained so an unknown
 *    scope cannot be minted into the table.
 *  - Revocation is the ROW VALUE `revoked_at` (not row deletion): the row is
 *    the audit trail and a revoked token fails verification afterward.
 *  - Rotation is revoke + re-mint (two rows, one live) — no UPDATE of the
 *    hash, so an in-flight token is never silently re-targeted.
 */
import type { Kysely, } from "kysely";
import { sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("agent_tokens",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("token_hash", "text", (col,) => col.notNull().unique(),)
    .addColumn("scope", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("revoked_at", "text",)
    .addColumn("last_used_at", "text",)
    .addCheckConstraint(
      "ck_agent_tokens_scope",
      sql`(scope IN ('agent:worktree', 'agent:check', 'agent:commit', 'agent:finalize'))`,
    )
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("agent_tokens",).ifExists().execute();
}
