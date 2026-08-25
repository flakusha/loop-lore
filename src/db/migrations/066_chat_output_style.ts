/**
 * Chat Output Styling — output_style_preset on chats
 *
 * Adds a nullable `output_style_preset` column (NULL = no style override, so
 * existing chats keep their current prompt shape — the prompt section stays
 * disabled). The richer per-chat tuning lives in `chats.gm_config.outputStyle`
 * (already-present JSON column), resolved via the chat → user → server
 * fallback and injected as a prompt section.
 *
 * Orthogonal to response *length* (owned by resolveResponseLength): styling is
 * about HOW the model writes (high fantasy, noir, cyberpunk, …), length about
 * HOW MUCH. See epic-chat-context-optimization.md (Output Styling Parameters).
 */
import type { Kysely, } from "kysely";

export async function up(db: Kysely<unknown>,): Promise<void> {
  await db.schema
    .alterTable("chats",)
    .addColumn("output_style_preset", "text",)
    .execute();
}

export async function down(db: Kysely<unknown>,): Promise<void> {
  await db.schema
    .alterTable("chats",)
    .dropColumn("output_style_preset",)
    .execute();
}
