// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 118_agent_token_expiry
 *
 * Agent-token lifetime (TASK-recursive-self-improvement-agent-token-lifecycle-
 * issuance-rotation-rev): `expires_at` is an optional UTC ISO instant on
 * 114_rsi_agent_tokens. NULL means "no expiry" — the column is additive so
 * rows minted before this migration keep working and rotation/revocation
 * semantics stay unchanged.
 *
 * The partial index covers only live, expiring rows: verification looks a
 * token up by `token_hash` (already unique), so this index is for policy
 * reporting/cleanup sweeps, not the auth hot path.
 *
 * Append-only policy: never edit an applied migration; add a new one.
 */
import type { Kysely, } from "kysely";
import { sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("agent_tokens",)
    .addColumn("expires_at", "text",)
    .execute();

  await sql`
    CREATE INDEX IF NOT EXISTS idx_agent_tokens_expires_at
    ON agent_tokens (expires_at) WHERE expires_at IS NOT NULL
  `.execute(database,);
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await sql`DROP INDEX IF EXISTS idx_agent_tokens_expires_at`.execute(database,);
  await database.schema
    .alterTable("agent_tokens",)
    .dropColumn("expires_at",)
    .execute();
}
