/**
 * Per-chat Prompt Override — prompt_override on chats
 *
 * 0.1.0 Quick Win item 6 completion: after the prompt-template registry +
 * read-only preview shipped (TASK-prompt-template-registry), the missing piece
 * is a per-chat inline override. Adds a nullable `prompt_override` column
 * (NULL = use character/world-setup/registry default). When set, it replaces
 * the system prompt for this chat in prompt assembly — highest precedence,
 * above world-setup and character overrides.
 *
 * Distinct from `character_world_setup.system_prompt_override` (character-level,
 * migration 042); this is chat-scoped. See TASK-PROMPT-TEMPLATE-PER-CHAT-OVERRIDE-UX.
 */
import type { Kysely, } from "kysely";

export async function up(db: Kysely<unknown>,): Promise<void> {
  await db.schema
    .alterTable("chats",)
    .addColumn("prompt_override", "text",)
    .execute();
}
