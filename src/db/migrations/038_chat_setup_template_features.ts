/**
 * Chat Setup Template Features + Visibility — DB Schema
 *
 * Extends `chat_setup_templates` with:
 * - `features`: JSON array of short display tags ("rpg mode", "vn mode",
 *   "no quests", "sfw only", "no gm", "no assistant", ...) shown as a feature
 *   list under the template selector at world/location/chat creation.
 *   Purely descriptive for now — enforcement is a per-feature concern tracked
 *   on the template lifecycle ticket.
 * - `visibility`: template-level chat visibility state (private|public|unlisted)
 *   seeded onto chats created from the template. The default `world` template
 *   declares `public` so location auto-chats are discoverable. Text state, not
 *   a boolean flag — new levels (invite-only, world, friends) extend the enum.
 *
 * See .plan/tickets/FEAT-world-template-chat-lifecycle.md.
 */
import type { Kysely, } from "kysely";

export async function up(db: Kysely<unknown>,): Promise<void> {
  // SQLite ALTER TABLE supports one ADD COLUMN per statement.
  await db.schema
    .alterTable("chat_setup_templates",)
    .addColumn("features", "text", (col,) => col.defaultTo("[]",),)
    .execute();
  await db.schema
    .alterTable("chat_setup_templates",)
    .addColumn("visibility", "text", (col,) => col.defaultTo(null,),)
    .execute();
}

export async function down(db: Kysely<unknown>,): Promise<void> {
  // SQLite ALTER TABLE supports one DROP COLUMN per statement.
  await db.schema
    .alterTable("chat_setup_templates",)
    .dropColumn("visibility",)
    .execute();
  await db.schema
    .alterTable("chat_setup_templates",)
    .dropColumn("features",)
    .execute();
}
