import { type Kysely, } from "kysely";

/**
 * Add content_hash column to assets table for idempotent upload detection.
 * SHA-256 hash of raw file content, computed before encryption.
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("assets",)
    .addColumn("content_hash", "text",)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("assets",)
    .dropColumn("content_hash",)
    .execute();
}
