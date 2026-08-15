/**
 * Chat Visibility State — DB Schema
 *
 * Adds `chats.visibility` (text state: private|public|unlisted, default
 * private). Marks a chat as discoverable — public location/world chats are
 * joinable via the existing join/joinable endpoints. Text state machine, not
 * a boolean flag: future levels (invite-only, world, friends) extend the enum
 * without schema churn.
 *
 * See .plan/tickets/FEAT-world-template-chat-lifecycle.md.
 */
import type { Kysely, } from "kysely";

export async function up(db: Kysely<unknown>,): Promise<void> {
  await db.schema
    .alterTable("chats",)
    .addColumn("visibility", "text", (col,) => col.notNull().defaultTo("private",),)
    .execute();
}

export async function down(db: Kysely<unknown>,): Promise<void> {
  await db.schema.alterTable("chats",).dropColumn("visibility",).execute();
}
