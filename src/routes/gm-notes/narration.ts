// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * GM Notes — shadow-note reveal narration.
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
import type { HandlerOpts, } from "./types";

/**
 * Inject a narrator system message into the chat when a shadow note is revealed.
 * Reveals are rare and high-impact — the narration makes the moment memorable
 * instead of silently flipping the note's status in the background.
 *
 * Mirrors the pattern from `src/story/game-master/narration.ts`.
 * @param database
 * @param chatId
 * @param content
 * @throws {Error} when the narrator message insert fails (propagated; the
 * reveal route intentionally does not swallow it)
 */
export async function injectShadowRevealNarration(
  database: HandlerOpts["database"],
  chatId: string,
  content: string,
): Promise<void> {
  const narrator = await database
    .selectFrom("actors",)
    .select("id",)
    .where("actor_type", "=", "narrator",)
    .where("agent_type", "=", "narrator",)
    .executeTakeFirst();

  if (!narrator) { return; }

  const text = `[Shadow Revealed] ${content}`;

  let storedContent = text;
  let storedKeyId: string | null = null;
  if (isEncryptionEnabled()) {
    const smk = getSmk()!;
    const enc = await encryptMessageContent({
      database,
      chatId,
      actorId: narrator.id,
      plaintext: text,
      smk,
    },);

    storedContent = enc.storedContent;
    storedKeyId = enc.keyId ?? null;
  }

  await database
    .insertInto("messages",)
    .values({
      id: randomUUID() as string,
      chat_id: chatId,
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
