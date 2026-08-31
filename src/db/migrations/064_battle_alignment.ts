import { type Kysely, } from "kysely";

/**
 * Battle alignment — mark a combatant's side for the battle roster.
 *
 * `resolveBattleRoster` (src/assistant/commands/battle-utils.ts) builds the
 * chat's combatant roster from `character_stats`; without an explicit signal
 * every combatant was treated as a player (`isNpc: false`), so battles could
 * never reach the engine's defeat check. This column lets a character be
 * flagged `enemy` (via `/battle align`), turning them into an NPC combatant.
 *
 * Stored as text with a CHECK on the two allowed values (battle-side enum is
 * intentionally simple; the combat engine derives everything else from a
 * `Combatant`).
 * @param database
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("character_stats",)
    .addColumn("combat_alignment", "text", (col,) => col.notNull().defaultTo("player",),)
    .execute();
}

/**
 * @param database
 */
export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("character_stats",)
    .dropColumn("combat_alignment",)
    .execute();
}
