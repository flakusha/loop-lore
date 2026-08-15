/**
 * Thinking Persistence + Chat Thinking Visibility — DB Schema
 *
 * 1. Adds `messages.thinking` (nullable text) — stores the LLM's
 *    reasoning/thinking content alongside the response. Ephemeral before;
 *    now persisted so page-reload preserves the thinking block.
 *
 * 2. Adds `chats.thinking_visibility` (text state: hidden|collapsed|visible,
 *    default hidden). Controls how thinking blocks render in the chat UI:
 *    - hidden:    thinking not rendered at all (default — no context spoiling)
 *    - collapsed: thinking rendered inside <details> collapsed
 *    - visible:   thinking rendered expanded (debugging mode)
 */
import type { Kysely, } from "kysely";

export async function up(db: Kysely<unknown>,): Promise<void> {
  await db.schema
    .alterTable("messages",)
    .addColumn("thinking", "text",)
    .execute();

  await db.schema
    .alterTable("chats",)
    .addColumn("thinking_visibility", "text", (col,) => col.notNull().defaultTo("hidden",),)
    .execute();
}

export async function down(db: Kysely<unknown>,): Promise<void> {
  await db.schema.alterTable("chats",).dropColumn("thinking_visibility",).execute();
  await db.schema.alterTable("messages",).dropColumn("thinking",).execute();
}
