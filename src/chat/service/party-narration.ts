// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Party VN narration (extracted from ./party.ts).
 *
 * Best-effort narrator-voiced timeline messages for party join/leave events.
 */
import type { Kysely, } from "kysely";
import { encryptMessageContent, getSmk, isEncryptionEnabled, } from "../../crypto";
import {
  ContentEncoding,
  MessageContentFormat,
  MessageContentType,
  MessageRole,
  MessageStatus,
  MessageVisibility,
} from "../../db/enums";
import type { DB, } from "../../db/schema";
import { indexMessageSearchTokens, } from "../../search";
/**
 * Find the narrator actor, if one exists. Mirrors GM `injectNarration`.
 * @param database
 * @returns void
 */
async function findNarrator(
  database: Kysely<DB>,
): Promise<{ id: string } | null> {
  const narrator = await database
    .selectFrom("actors",)
    .select("id",)
    .where("actor_type", "=", "narrator",)
    .where("agent_type", "=", "narrator",)
    .executeTakeFirst();

  return narrator ?? null;
}

/**
 * Append a VN narration message for a party event, best-effort. Mirrors the
 * GM `injectNarration` write path (encryption + narrator actor lookup). Any
 * failure is non-fatal — the party mutation has already succeeded.
 * @param database
 * @param chatId
 * @param text
 * @returns void
 */
export async function injectPartyNarration(
  database: Kysely<DB>,
  chatId: string,
  text: string,
): Promise<void> {
  try {
    const narrator = await findNarrator(database,);
    if (!narrator) { return; }

    const narrationId = crypto.randomUUID();
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
      storedKeyId = enc.keyId;
    }

    await database
      .insertInto("messages",)
      .values({
        id: narrationId,
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

    // The row carries no plaintext mirror: index blind tokens for the token
    // tier (no-op unless ENABLE_TOKEN_INDEXING=1; best-effort like the insert).
    await indexMessageSearchTokens(database, {
      messageId: narrationId,
      chatId,
      plaintext: text,
      keyId: storedKeyId,
    },);
  } catch {
    /* non-fatal — party mutation already applied */
  }
}
