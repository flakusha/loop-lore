/**
 * Chat Custom Instructions — custom_instructions on chats
 *
 * Adds a nullable `custom_instructions` column: the per-story tier of the
 * two-tier user steering (account tier lives in `users.settings` JSON under
 * `customInstructions`). NULL = no per-story steering, so existing chats keep
 * their current prompt shape and the prompt section stays disabled.
 *
 * Both tiers are injected as one `<custom_instructions>` system section
 * (global first, story stacked on top) by
 * src/assistant/prompt/sections/custom-instructions.ts.
 * See TASK-two-tier-custom-instructions.md.
 */
import type { Kysely, } from "kysely";

/**
 * @param db
 */
export async function up(db: Kysely<unknown>,): Promise<void> {
  await db.schema
    .alterTable("chats",)
    .addColumn("custom_instructions", "text",)
    .execute();
}

/**
 * @param db
 */
export async function down(db: Kysely<unknown>,): Promise<void> {
  await db.schema
    .alterTable("chats",)
    .dropColumn("custom_instructions",)
    .execute();
}
