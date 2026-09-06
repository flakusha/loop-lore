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
 * @param database
 * @param sourceChatId
 * @param newChatId
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
    // BUG-carryhistory-copies-key-id: `key_id` points at a chat_keys row
    // owned by the SOURCE chat. If the source is deleted (migration 054
    // cascades chat_keys) or re-keyed on member leave, the carried copy's
    // key_id dangles and its messages throw 'Chat key not found' on read.
    // Carry the plaintext mirror instead and null key_id so the target
    // chat's read path uses content_plaintext (FTS + resolveMessageContent).
    // Rows with ciphertext and no plaintext mirror are undecryptable after
    // the source is gone — dropping them keeps the migrated chat readable.
    const newId = crypto.randomUUID();
    const parentId = m.parent_id ? (idRemap.get(m.parent_id,) ?? null) : null;
    if (m.key_id && !m.content_plaintext) {
      continue;
    }
    await database
      .insertInto("messages",)
      .values({
        id: newId,
        chat_id: newChatId,
        actor_id: m.actor_id,
        parent_id: parentId,
        role: m.role,
        content: m.content,
        key_id: null,
        content_type: m.content_type,
        content_format: m.content_format,
        // Carry the plaintext shadow column so the carried chat is both
        // searchable (migration 068 FTS indexes it) and readable: the read
        // path resolves content_plaintext directly, never touching the
        // now-nulled key_id. Rows with a populated plaintext mirror keep
        // full fidelity; seed-era rows without one are dropped above.
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
