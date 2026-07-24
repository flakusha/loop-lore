import type { Kysely, } from "kysely";

/**
 * Migration 028 — Add streaming column to chats
 *
 * Adds the `streaming` column to `chats` to control per-chat streaming mode.
 *   - `1` (true)  — always stream when provider supports it
 *   - `0` (false) — never stream, use non-streaming mode
 *   - `NULL`      — use provider capability / config default
 *
 * Resolution chain: chat.streaming → config.generation.defaultStream → provider.capabilities.streaming
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("chats",)
    .addColumn("streaming", "integer", (col,) => col.defaultTo(null,),)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("chats",)
    .dropColumn("streaming",)
    .execute();
}
