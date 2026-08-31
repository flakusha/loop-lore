// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Migration 049 — Persona Tuning + Role Tuning
 *
 * Adds per-persona tuning overrides (temperature, max_tokens, model) and
 * per-role tuning defaults (temperature, max_tokens) to model_role_overrides.
 *
 * SQLite permits only one ADD COLUMN per ALTER TABLE statement.
 */
import { type Kysely, } from "kysely";

/**
 * @param db
 */
export async function up(db: Kysely<unknown>,): Promise<void> {
  // Persona tuning fields
  await db.schema
    .alterTable("personas",)
    .addColumn("temperature", "real",)
    .execute();

  await db.schema
    .alterTable("personas",)
    .addColumn("max_tokens", "integer",)
    .execute();

  await db.schema
    .alterTable("personas",)
    .addColumn("model", "text",)
    .execute();

  // Role tuning defaults
  await db.schema
    .alterTable("model_role_overrides",)
    .addColumn("temperature", "real",)
    .execute();

  await db.schema
    .alterTable("model_role_overrides",)
    .addColumn("max_tokens", "integer",)
    .execute();
}

/**
 * @param db
 */
export async function down(db: Kysely<unknown>,): Promise<void> {
  await db.schema.alterTable("model_role_overrides",).dropColumn("max_tokens",).execute();
  await db.schema.alterTable("model_role_overrides",).dropColumn("temperature",).execute();
  await db.schema.alterTable("personas",).dropColumn("model",).execute();
  await db.schema.alterTable("personas",).dropColumn("max_tokens",).execute();
  await db.schema.alterTable("personas",).dropColumn("temperature",).execute();
}
