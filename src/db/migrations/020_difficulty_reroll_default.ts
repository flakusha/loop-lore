/**
 * Migration 020 — Fix difficulty_reroll default "off" → "none"
 *
 * The worlds table was created with default "off" for difficulty_reroll,
 * but the DifficultyReroll enum defines "none" / "per_turn" / "per_quest".
 * No application code ever relied on the "off" default — the API handler
 * always sets the value explicitly.
 *
 * SQLite 3.35+ supports DROP COLUMN so we recreate the column.
 */
import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<any>): Promise<void> {
  await database.schema
    .alterTable("worlds")
    .addColumn("difficulty_reroll_v2", "text", (col) => col.notNull().defaultTo("none"))
    .execute();

  await database
    .updateTable("worlds")
    .set({ difficulty_reroll_v2: "none" } as any)
    .where("difficulty_reroll", "=", "off")
    .execute();

  await sql`
    UPDATE worlds
    SET difficulty_reroll_v2 = difficulty_reroll
    WHERE difficulty_reroll != 'off'
  `.execute(database);

  await database.schema.alterTable("worlds").dropColumn("difficulty_reroll").execute();
  await database.schema.alterTable("worlds").renameColumn("difficulty_reroll_v2", "difficulty_reroll").execute();
}

export async function down(database: Kysely<any>): Promise<void> {
  await database.schema
    .alterTable("worlds")
    .addColumn("difficulty_reroll_old", "text", (col) => col.notNull().defaultTo("off"))
    .execute();

  await database
    .updateTable("worlds")
    .set({ difficulty_reroll_old: "off" } as any)
    .where("difficulty_reroll", "=", "none")
    .execute();

  await sql`
    UPDATE worlds
    SET difficulty_reroll_old = difficulty_reroll
    WHERE difficulty_reroll != 'none'
  `.execute(database);

  await database.schema.alterTable("worlds").dropColumn("difficulty_reroll").execute();
  await database.schema.alterTable("worlds").renameColumn("difficulty_reroll_old", "difficulty_reroll").execute();
}