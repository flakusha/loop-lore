// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 006_worlds_rules_column
 *
 * Add `rules` JSON-as-text column to `worlds` (defaults to `'{}'`). The lore
 * prompt section reads `lifecycle_config` from this JSON to opt a world into
 * decay/distortion gating for its lore entries.
 *
 * Backward-compatible: existing rows behave identically when rules is `'{}'`
 * (the lifecycle resolver defaults `min_confidence` to 25, `decay_per_day` to
 * 0.5, `distortion_cap` to 80 — but with default `confidence=100,
 * distortion_level=0` row values these gates are no-ops in practice).
 *
 * Resolves: TASK-world-lore-lifecycle-confidence-decay-distortion
 *
 * Append-only; 001_init.ts and 002_world_lore_lifecycle.ts are shipped.
 */
import type { Kysely, } from "kysely";
import { sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("worlds",)
    .addColumn("rules", "text", (col,) => col.notNull().defaultTo(sql`('{}')`,),)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.alterTable("worlds",).dropColumn("rules",).execute();
}
