// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { resolveMessageContent, } from "../messages/helpers";
import { addChecksum, prettyJson, } from "./helpers";
import type { ExportContext, } from "./types";

/**
 * Export the user's chats (optionally filtered by chat ids) into
 * `zip/chats/` as JSON. Populates `ctx.counts.chats`.
 */
export async function exportChatsToZip(ctx: ExportContext,): Promise<void> {
  let query = ctx.database
    .selectFrom("chats",)
    .select(["id", "name", "type", "mode", "created_at",],)
    .where("created_by", "=", ctx.userId,);

  if (ctx.chatIds && ctx.chatIds.length > 0) {
    query = query.where("id", "in", ctx.chatIds,);
  }

  const chats = await query.execute();
  const chatsFolder = ctx.zip.folder("chats",);

  for (const chat of chats) {
    const rows = await ctx.database
      .selectFrom("messages",)
      .innerJoin("actors", "actors.id", "messages.actor_id",)
      .select([
        "messages.id",
        "messages.chat_id",
        "messages.content",
        "messages.content_encoding",
        "messages.key_id",
        "messages.role",
        "messages.created_at",
        "actors.display_name",
      ],)
      .where("messages.chat_id", "=", chat.id,)
      .orderBy("messages.created_at", "asc",)
      .execute();

    // Resolve message bodies to plaintext via the shared helper so the ZIP
    // export carries decoded text — never raw ciphertext (data leak) nor
    // base64 gzip (which would be opaque to importers).
    const messages: {
      id: string;
      role: string;
      author: string | null;
      content: string;
      created_at: string | Date;
    }[] = [];
    for (const row of rows) {
      let content: string;
      try {
        content = await resolveMessageContent(ctx.database, row,);
      } catch {
        content = "[Encrypted — unable to decrypt]";
      }
      messages.push({
        id: row.id,
        role: row.role,
        author: row.display_name,
        content,
        created_at: row.created_at,
      },);
    }

    const chatData = {
      id: chat.id,
      name: chat.name,
      type: chat.type,
      mode: chat.mode,
      created_at: chat.created_at,
      messages,
    };

    const filename = (chat.name ?? chat.id).replaceAll(/[^a-z0-9]/gi, "_",).toLowerCase();
    const content = prettyJson(chatData,);
    chatsFolder?.file(`${filename}.json`, content,);
    addChecksum(ctx.checksums, `chats/${filename}.json`, content,);

    ctx.onItem?.({
      id: chat.id,
      type: "chat",
      name: chat.name ?? chat.id,
      format: "json",
      filename: `${filename}.json`,
      checksum: ctx.checksums[`chats/${filename}.json`] ?? "",
      size: content.length,
      metadata: {
        message_count: messages.length,
        chat_type: chat.type,
        chat_mode: chat.mode,
      },
    },);
  }
  ctx.counts.chats = chats.length;
}
