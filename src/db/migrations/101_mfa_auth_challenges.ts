/**
 * 101_mfa_auth_challenges
 *
 * MFA challenge store (epic-auth-channel-provisioning F1, slice 1 of 3 —
 * challenge store + issue/verify/expire; delivery lands in later slices).
 *
 *  - auth_factors: one enrolled factor per row (user + kind + created).
 *    Factor secrets, state and verified_at are LATER slices — this migration
 *    only carries the columns the challenge store binds to.
 *  - auth_challenges: one issued challenge per row.
 *      · nonce_hash holds ONLY the Argon2id hash of the issued code — the
 *        plaintext code exists solely in the issue response and is never
 *        stored, never logged (epic secret-hygiene rule).
 *      · expires_at is epoch milliseconds so TTL checks compare against the
 *        injected clock without date parsing.
 *      · attempts counts failed verifications; consumed = 1 means the
 *        challenge is spent (verified or superseded by a newer challenge).
 *
 * The challenge is bound to (user, factor, purpose): purpose travels on the
 * challenge row because one factor serves several purposes (login, step-up,
 * enroll, address change, unlock).
 */
import type { Kysely, } from "kysely";
import { sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("auth_factors",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("user_id", "text", (col,) => col.notNull().references("users.id",).onDelete("cascade",),)
    .addColumn("kind", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "integer", (col,) => col.notNull(),)
    .execute();

  await database.schema
    .createTable("auth_challenges",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("user_id", "text", (col,) => col.notNull().references("users.id",).onDelete("cascade",),)
    .addColumn("factor_id", "text", (col,) => col.notNull().references("auth_factors.id",).onDelete("cascade",),)
    .addColumn("purpose", "text", (col,) => col.notNull(),)
    // Argon2id hash of the issued code — never the plaintext.
    .addColumn("nonce_hash", "text", (col,) => col.notNull(),)
    // Epoch milliseconds.
    .addColumn("expires_at", "integer", (col,) => col.notNull(),)
    .addColumn("attempts", "integer", (col,) => col.notNull().defaultTo(0,),)
    // 0 = still verifiable, 1 = spent (verified or superseded).
    .addColumn("consumed", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_at", "integer", (col,) => col.notNull(),)
    .execute();

  await sql`
    CREATE INDEX IF NOT EXISTS idx_auth_challenges_lookup
    ON auth_challenges (user_id, factor_id, purpose, consumed)
  `.execute(database,);

  await sql`
    CREATE INDEX IF NOT EXISTS idx_auth_challenges_expires_at
    ON auth_challenges (expires_at)
  `.execute(database,);

  await sql`
    CREATE INDEX IF NOT EXISTS idx_auth_factors_user
    ON auth_factors (user_id)
  `.execute(database,);
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await sql`DROP INDEX IF EXISTS idx_auth_challenges_expires_at`.execute(database,);
  await sql`DROP INDEX IF EXISTS idx_auth_challenges_lookup`.execute(database,);
  await sql`DROP INDEX IF EXISTS idx_auth_factors_user`.execute(database,);
  await database.schema.dropTable("auth_challenges",).execute();
  await database.schema.dropTable("auth_factors",).execute();
}
