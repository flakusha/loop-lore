// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Quest reward ledger (TASK-049 items-domain slice).
 *
 * `quest_reward_ledger` records which `world_items` instances a quest reward
 * persistence produced, keyed by a caller-supplied `ledger_key` (unique per
 * world). Re-running `persistLoot` with the same key resolves the recorded
 * instance ids instead of double-crediting the reward.
 *
 * Top-level (not a `001_init` part): `001_init.ts` is frozen. New top-level
 * migrations are auto-discovered by `getMigrationFiles()` (sorted by name).
 */
import { type Kysely, sql, } from "kysely";
import { recordSchemaVersion, } from "../schema-version";

/**
 * @param database
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("quest_reward_ledger",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",),)
    .addColumn("ledger_key", "text", (col,) => col.notNull(),)
    .addColumn("world_item_ids", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createIndex("idx_quest_reward_ledger_unique",)
    .on("quest_reward_ledger",)
    .columns(["world_id", "ledger_key",],)
    .unique()
    .execute();

  await recordSchemaVersion(database, 31, "quest reward ledger (idempotent loot persistence)",);
}

/**
 * @param database
 */
export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("quest_reward_ledger",).execute();
}
