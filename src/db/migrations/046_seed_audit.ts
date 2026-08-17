/**
 * Seed Audit Trail — seed_audit
 *
 * Records every entity created by the config-driven seeding pipeline
 * (TASK-user-seeding-role-expansion) so operators can see what was seeded,
 * when, by whom, and in which environment. Written idempotently alongside each
 * seeded entity; never the source of truth for existence (lookups use the
 * domain tables), only an audit log.
 */
import type { Kysely, } from "kysely";

export async function up(db: Kysely<unknown>,): Promise<void> {
  await db.schema
    .createTable("seed_audit",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("seed_type", "text", (col,) => col.notNull(),)
    .addColumn("seed_id", "text", (col,) => col.notNull(),)
    .addColumn("seeded_by", "text", (col,) => col.notNull(),)
    .addColumn("seeded_at", "text", (col,) => col.notNull(),)
    .addColumn("environment", "text", (col,) => col.notNull(),)
    .addColumn("metadata", "text",)
    .execute();
}

export async function down(db: Kysely<unknown>,): Promise<void> {
  await db.schema.dropTable("seed_audit",).execute();
}
