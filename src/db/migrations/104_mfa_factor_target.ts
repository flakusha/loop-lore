// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 104_mfa_factor_target
 *
 * Append-only: enroll a factor's delivery destination beside its kind so a
 * challenge issue can bind the caller-supplied address to the enrolled row.
 * Nullable: factors enrolled before this migration stay valid rows but cannot
 * issue codes (fail closed) until a destination is enrolled. `verified_at`
 * makes ownership proof explicit: unverified factors have zero auth power.
 *
 * Numbered 104 because 102/103 are already shipped on dev — reusing a prefix
 * breaks the migration ordering pin in migrations.test.ts.
 */
import type { Kysely, } from "kysely";

/**
 * Add the nullable `target` and `verified_at` columns to `auth_factors`.
 * @param database Migration database handle.
 * @returns Resolves when the columns exist.
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("auth_factors",)
    .addColumn("target", "text", (col,) => col,)
    .execute();

  await database.schema
    .alterTable("auth_factors",)
    .addColumn("verified_at", "integer", (col,) => col,)
    .execute();
}

/**
 * Remove `verified_at` and `target` — the exact reverse of {@link up}.
 * @param database Migration database handle.
 * @returns Resolves when the columns are gone.
 */
export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("auth_factors",)
    .dropColumn("verified_at",)
    .execute();

  await database.schema
    .alterTable("auth_factors",)
    .dropColumn("target",)
    .execute();
}
