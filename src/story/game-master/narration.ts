// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Game Master Service — Narration Dispatcher
 *
 * injectNarration: write narrator messages into each story chat
 * of a world, encrypting when server-side encryption is enabled.
 */
import { randomUUID, } from "node:crypto";
import { encryptMessageContent, getSmk, isEncryptionEnabled, } from "../../crypto";
import {
  ContentEncoding,
  MessageContentFormat,
  MessageContentType,
  MessageRole,
  MessageStatus,
  MessageVisibility,
} from "../../db/enums";
import type { GmState, } from "./types";

/** Inject narration message into the story timeline */
export async function injectNarration(state: GmState, worldId: string, text: string,): Promise<void> {
  const narrator = await state.db
    .selectFrom("actors",)
    .select("id",)
    .where("actor_type", "=", "narrator",)
    .where("agent_type", "=", "narrator",)
    .executeTakeFirst();

  if (!narrator) { return; }

  const chats = await state.db
    .selectFrom("chats",)
    .select("id",)
    .where("world_id", "=", worldId,)
    .where("mode", "=", "story",)
    .execute();

  for (const chat of chats) {
    // Encrypt narration bodies when server-side encryption is enabled, so the
    // story/GM write path matches auto-gen (encrypted rows: identity encoding
    // + key_id set; read path keys on key_id presence).
    let storedContent = text;
    let storedKeyId: string | null = null;
    if (isEncryptionEnabled()) {
      const smk = getSmk()!;
      const enc = await encryptMessageContent({
        database: state.db,
        chatId: chat.id,
        actorId: narrator.id,
        plaintext: text,
        smk,
      },);
      storedContent = enc.storedContent;
      storedKeyId = enc.keyId;
    }

    await state.db
      .insertInto("messages",)
      .values({
        id: randomUUID() as string,
        chat_id: chat.id,
        actor_id: narrator.id,
        role: MessageRole.System,
        content: storedContent,
        key_id: storedKeyId,
        content_type: MessageContentType.Narration,
        content_format: MessageContentFormat.Markdown,
        content_encoding: ContentEncoding.Identity,
        status: MessageStatus.Confirmed,
        visibility: MessageVisibility.Visible,
      },)
      .execute();
  }
}
