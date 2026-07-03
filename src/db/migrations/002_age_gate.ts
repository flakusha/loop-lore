import type { Kysely } from "kysely";

/**
 * Migration 002: Add age gate columns to users table.
 *
 * Adds nullable birth_date and age_gate_accepted_at columns for
 * age verification / compliance. No change when the age gate feature
 * is disabled — these columns simply remain NULL.
 */
export async function up(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("users")
    .addColumn("birth_date", "text")
    .execute();

  await db.schema
    .alterTable("users")
    .addColumn("age_gate_accepted_at", "text")
    .execute();
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await db.schema
    .alterTable("users")
    .dropColumn("age_gate_accepted_at")
    .execute();

  await db.schema
    .alterTable("users")
    .dropColumn("birth_date")
    .execute();
}