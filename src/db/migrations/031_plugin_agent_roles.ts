/**
 * Migration 031 — Plugin agent role assignment
 *
 * Adds `agent_role` to `actors` and `characters` so a character can be
 * assigned a plugin-declared agent role (e.g. `card-battler`,
 * `seduction-partner`, `rps-player`, `trivia-host`). The role id is a
 * kebab-case string referencing a plugin's registered AgentRoleDefinition.
 *
 * Nullable: most actors have no plugin role. When set, the prompt
 * assembler injects the role's system prompt and the generation route
 * gates plugin tools to the role's declared tool list.
 */
import type { Kysely, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("actors",)
    .addColumn("agent_role", "text",)
    .execute();

  await database.schema
    .alterTable("characters",)
    .addColumn("agent_role", "text",)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("characters",)
    .dropColumn("agent_role",)
    .execute();

  await database.schema
    .alterTable("actors",)
    .dropColumn("agent_role",)
    .execute();
}
