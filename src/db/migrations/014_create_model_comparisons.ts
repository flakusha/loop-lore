import type { Kysely, } from "kysely";

/**
 * Migration 029 — Model Comparison Tracking
 *
 * Adds a model_comparisons table for Q4 model-comparison dashboard.
 * Users can submit preference data (better/worse/same) comparing
 * response models against a reference, with a confidence score.
 * @param db
 */
export async function up(db: Kysely<unknown>,): Promise<void> {
  await db.schema
    .createTable("model_comparisons",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("message_id", "text", (col,) => col.notNull(),)
    .addColumn("user_id", "text", (col,) => col.notNull(),)
    .addColumn("reference_model", "text", (col,) => col.notNull(),)
    .addColumn("preference", "text", (col,) => col.notNull(),)
    .addColumn("confidence", "real", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .execute();
}

/**
 * @param db
 */
export async function down(db: Kysely<unknown>,): Promise<void> {
  await db.schema.dropTable("model_comparisons",).execute();
}
