/**
 * Quick-Reply Button Sets — quick_replies on chats
 *
 * 0.1.0 Quick Win item 1 (matrix gap G22): quick-reply button sets rendered
 * above the message input (SillyTavern QR inspiration). Adds a nullable
 * `quick_replies` JSON column on chats: array of
 * `{ label, command, trigger? }` where command is a slash command and trigger
 * is an optional event ("startup" fires once per chat open; "user"/"ai" are
 * reserved for follow-up event automation).
 *
 * Stored as JSON text (gm_config precedent); parsed by the frontend.
 * See TASK-QUICK-REPLY-EVENT-DRIVEN-AUTOMATION.
 */
import type { Kysely, } from "kysely";

export async function up(db: Kysely<unknown>,): Promise<void> {
  await db.schema
    .alterTable("chats",)
    .addColumn("quick_replies", "text",)
    .execute();
}
