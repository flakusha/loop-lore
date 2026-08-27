// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat migration carry: full history.
 *
 * Copies the source chat's `messages` tree (preserving swipes) into the
 * migrated chat.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";

// ── Carry full history ─────────────────────────────────────────

/**
 * Carry full history (message tree, preserving swipes).
 */
export async function carryHistory(
  database: Kysely<DB>,
  sourceChatId: string,
  newChatId: string,
): Promise<void> {
  const messages = await database
    .selectFrom("messages",)
    .selectAll()
    .where("chat_id", "=", sourceChatId,)
    .orderBy("created_at", "asc",)
    .execute();

  // Maps a source-chat message id to its id in the migrated chat, so the
  // carried tree's parent_id links resolve within the new chat instead of
  // pointing back at stale source-chat ids. Rows are inserted in created_at
  // order, so a parent always precedes (and is remapped before) its children.
  const idRemap = new Map<string, string>();

  for (const m of messages) {
    const newId = crypto.randomUUID();
    const parentId = m.parent_id ? (idRemap.get(m.parent_id,) ?? null) : null;
    await database
      .insertInto("messages",)
      .values({
        id: newId,
        chat_id: newChatId,
        actor_id: m.actor_id,
        parent_id: parentId,
        role: m.role,
        content: m.content,
        key_id: m.key_id,
        content_type: m.content_type,
        content_format: m.content_format,
        // Carry the plaintext shadow column too so the carried chat is
        // searchable from the get-go (migration 068). If the source row
        // never had it populated (legacy data inserted before this
        // migration), the carried row keeps it null — the migration-068
        // `messages_fts_au` trigger then leaves the FTS row empty for it.
        content_plaintext: m.content_plaintext,
        content_encoding: m.content_encoding,
        status: m.status,
        visibility: m.visibility,
        swipe_index: m.swipe_index,
        created_at: m.created_at,
        edited_at: m.edited_at,
        attachments: m.attachments,
        archived_at: m.archived_at,
        section_id: m.section_id,
      },)
      .execute();
    idRemap.set(m.id, newId,);
  }
}
