/**
 * Migration 018 — Drop redundant `chat_purpose` column
 *
 * Migration 009 created `chat_purpose` on `chats`.
 * Migration 017 added the canonical `purpose` column (same semantics).
 * Both columns coexist with the same default ("main").
 *
 * This migration drops `chat_purpose` since `purpose` is the
 * authoritative column per schema-core.ts.
 */
import type { Kysely } from "kysely";

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable("chats").dropColumn("chat_purpose").execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable("chats")
    .addColumn("chat_purpose", "text", (col) => col.notNull().defaultTo("main"))
    .execute();
}
