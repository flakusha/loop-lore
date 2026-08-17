import { type Kysely, sql, } from "kysely";

/**
 * Battles — per-chat RPG encounter persistence.
 *
 * The pure combat engine (src/rpg/combat) resolves stateless combatant
 * transitions; this table gives each chat a durable, active encounter.
 * `combatants` holds the serialized `Combatant[]` roster (hp, ac, initiative,
 * actions, conditions) and `log` holds the `CombatAction[]` history — both
 * stored as JSON text (gm_config / tool_calls precedent). `/attack` and
 * `/heal` read + mutate this row via the pure engine and persist it back.
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("battles",)
    .addColumn("id", "text", (col,) => col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`,),)
    .addColumn("chat_id", "text", (col,) => col.notNull(),)
    .addColumn("world_id", "text",)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("active",),)
    .addColumn("round", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("turn_index", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("combatants", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("log", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("created_by", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("ended_at", "text",)
    .execute();

  await database.schema
    .createIndex("idx_battles_chat",)
    .on("battles",)
    .column("chat_id",)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("battles",).execute();
}
