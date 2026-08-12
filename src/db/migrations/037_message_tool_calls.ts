import { type Kysely, } from "kysely";

/**
 * Message Tool Calls — DB Schema
 *
 * Adds a nullable `tool_calls` JSON column to `messages` so assistant
 * messages that invoked function calls during generation can record them
 * (tool name + arguments). Mirrors the established convention of storing
 * JSON objects/arrays as TEXT (e.g. `attachments`). The read path parses
 * this back into an array for the frontend tool-call UI.
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("messages",)
    .addColumn("tool_calls", "text",)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("messages",)
    .dropColumn("tool_calls",)
    .execute();
}
