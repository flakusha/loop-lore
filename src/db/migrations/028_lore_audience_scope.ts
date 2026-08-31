/**
 * Lore Audience Scope — DB Schema
 *
 * Adds an `audience_scope` JSON column to actor_lore_entries and world_lore_entries
 * enabling subject-based audience scoping (world / location / profession / race).
 *
 * See docs/spec/lore.md §3. Shape (stored as JSON):
 *   { subject: { kind: "world" } |
 *               { kind: "location"; locationId?: string } |
 *               { kind: "profession"; profession: string } |
 *               { kind: "race"; race: string } |
 *               { kind: "faction" } | { kind: "item" },
 *     requires_presence?: boolean }
 *
 * Empty/null audience_scope = no restriction (visible to all), preserving current behavior.
 */
import type { Kysely, } from "kysely";

/**
 * @param db
 */
export async function up(db: Kysely<unknown>,): Promise<void> {
  await db.schema
    .alterTable("actor_lore_entries",)
    .addColumn("audience_scope", "text",)
    .execute();

  await db.schema
    .alterTable("world_lore_entries",)
    .addColumn("audience_scope", "text",)
    .execute();
}

/**
 * @param db
 */
export async function down(db: Kysely<unknown>,): Promise<void> {
  await db.schema.alterTable("world_lore_entries",).dropColumn("audience_scope",).execute();
  await db.schema.alterTable("actor_lore_entries",).dropColumn("audience_scope",).execute();
}
