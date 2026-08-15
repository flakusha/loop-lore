/**
 * Chat migration carry: location context.
 *
 * Copies the source chat's `chat_sections` (location-tagged journey sections)
 * into the migrated chat and re-points carried messages' `section_id` to the
 * new section ids, so travel history survives a template migration.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";

// ── Carry location context ────────────────────────────────────

/**
 * Carry location context: chat_sections + message section links.
 * Runs after carryHistory so the section remap reaches carried messages.
 */
export async function carryLocation(
  database: Kysely<DB>,
  sourceChatId: string,
  newChatId: string,
): Promise<void> {
  const sections = await database
    .selectFrom("chat_sections",)
    .selectAll()
    .where("chat_id", "=", sourceChatId,)
    .orderBy("sort_index", "asc",)
    .execute();

  const sectionIdRemap = new Map<string, string>();
  for (const section of sections) {
    const newId = crypto.randomUUID();
    await database
      .insertInto("chat_sections",)
      .values({
        id: newId,
        chat_id: newChatId,
        label: section.label,
        description: section.description,
        location_id: section.location_id,
        sort_index: section.sort_index,
        created_at: section.created_at,
        updated_at: section.updated_at,
      },)
      .execute();
    sectionIdRemap.set(section.id, newId,);
  }

  // Re-point carried messages' section links to the copied sections.
  for (const [oldSectionId, newSectionId,] of sectionIdRemap) {
    await database
      .updateTable("messages",)
      .set({ section_id: newSectionId, },)
      .where("chat_id", "=", newChatId,)
      .where("section_id", "=", oldSectionId,)
      .execute();
  }
}
