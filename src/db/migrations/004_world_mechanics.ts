// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Per-mechanic RPG opt-in flags on `worlds` (G5).
 *
 * Worlds previously gated all RPG features on one boolean
 * (`rpg_enabled`). This migration adds one flag per mechanic — dice,
 * checks, combat, xp, loot, quests — backfilled from `rpg_enabled` so
 * existing worlds keep their behavior (parity), while new worlds can opt
 * into mechanics individually via `getMechanicsConfig` /
 * `checkMechanicEnabled` (`src/rpg/service/world-gate.ts`).
 *
 * Top-level (not a `001_init` part): `001_init.ts` is frozen — Kysely
 * tracks it as one unit, so appended parts silently skip on existing
 * databases.
 *
 * SQLite supports one ADD COLUMN per alterTable statement.
 */
import { type Kysely, sql, } from "kysely";
import { recordSchemaVersion, removeSchemaVersion, } from "../schema-version";

/**
 * @param database
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("worlds",)
    .addColumn("rpg_dice", "integer", (col,) => col.notNull().defaultTo(0,),)
    .execute();
  await database.schema
    .alterTable("worlds",)
    .addColumn("rpg_checks", "integer", (col,) => col.notNull().defaultTo(0,),)
    .execute();
  await database.schema
    .alterTable("worlds",)
    .addColumn("rpg_combat", "integer", (col,) => col.notNull().defaultTo(0,),)
    .execute();
  await database.schema
    .alterTable("worlds",)
    .addColumn("rpg_xp", "integer", (col,) => col.notNull().defaultTo(0,),)
    .execute();
  await database.schema
    .alterTable("worlds",)
    .addColumn("rpg_loot", "integer", (col,) => col.notNull().defaultTo(0,),)
    .execute();
  await database.schema
    .alterTable("worlds",)
    .addColumn("rpg_quests", "integer", (col,) => col.notNull().defaultTo(0,),)
    .execute();
  // Parity backfill: worlds that opted into RPG keep every mechanic on.
  await sql`UPDATE worlds SET rpg_dice = rpg_enabled, rpg_checks = rpg_enabled, rpg_combat = rpg_enabled, rpg_xp = rpg_enabled, rpg_loot = rpg_enabled, rpg_quests = rpg_enabled`
    .execute(database,);
  await recordSchemaVersion(database, 25, "world per-mechanic RPG flags",);
}

/**
 * @param database
 */
export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("worlds",)
    .dropColumn("rpg_quests",)
    .execute();
  await database.schema
    .alterTable("worlds",)
    .dropColumn("rpg_loot",)
    .execute();
  await database.schema
    .alterTable("worlds",)
    .dropColumn("rpg_xp",)
    .execute();
  await database.schema
    .alterTable("worlds",)
    .dropColumn("rpg_combat",)
    .execute();
  await database.schema
    .alterTable("worlds",)
    .dropColumn("rpg_checks",)
    .execute();
  await database.schema
    .alterTable("worlds",)
    .dropColumn("rpg_dice",)
    .execute();
  await removeSchemaVersion(database, 25,);
}
