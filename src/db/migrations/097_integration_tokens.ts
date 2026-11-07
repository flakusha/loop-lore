/**
 * 097_integration_tokens
 *
 * Admin-scoped integration tokens (ADR-credentials-issuer-model §Decision a —
 * server-provided capability for integration clients). One credential table
 * for the issuing seam; the OAuth-style/BYOK issuer kind is a later column
 * addition (issuer kind is data, never a second code path — ADR structural
 * commitment).
 *
 *  - token_hash holds ONLY the SHA-256 hex of the raw token; the raw value is
 *    shown exactly once at mint time and never stored.
 *  - Revocation is the ROW VALUE `revoked_at` (not row deletion): the row is
 *    the audit trail of who minted what, and revocation stays queryable.
 *    (ADR says "revocable by row deletion"; the row-value form is the
 *    documented refinement here — fail-closed semantics identical.)
 *  - `expires_at` is OPTIONAL and defaults to NULL = never expires: token
 *    lifetime policy is an OPEN ADR question (§Open questions, "Token
 *    lifetime"), so the schema does not presume an answer.
 *  - `scopes` is the granted FacadeScope tier ("read" | "chat-write"),
 *    typed through COLUMN_TYPE_OVERRIDES as IntegrationTokenScope.
 */
import type { Kysely, } from "kysely";
import { sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("integration_tokens",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    // Unique: hash lookup IS the constant-time credential check (no secret
    // material leaves the row; a wrong token simply misses the index).
    .addColumn("token_hash", "text", (col,) => col.notNull().unique(),)
    .addColumn("scopes", "text", (col,) => col.notNull(),)
    .addColumn("issuer_admin_user_id", "text", (col,) => col.notNull().references("users.id",).onDelete("cascade",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("last_used_at", "text",)
    .addColumn("revoked_at", "text",)
    .addColumn("expires_at", "text",)
    .execute();

  await sql`
    CREATE INDEX IF NOT EXISTS idx_integration_tokens_issuer
    ON integration_tokens (issuer_admin_user_id)
  `.execute(database,);
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await sql`DROP INDEX IF EXISTS idx_integration_tokens_issuer`.execute(database,);
  await database.schema.dropTable("integration_tokens",).execute();
}
