// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/chat/service/rewrite-apply.ts
//
// Write-back for `/rewrite --apply`: replace a history message's content
// with its LLM rewrite. Mirrors the PATCH /messages/:id edit path but
// targets assistant/character messages (the rewrite surface) instead of
// user drafts. Ownership + same-chat scope gate every write.

import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import {
  encryptMessageContent,
  extractKeyIdFromPayload,
  getSmk,
  isEncryptedPayload,
  isEncryptionEnabled,
} from "../../crypto";
import type { ContentEncoding, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { can, } from "../../users/permissions";

/** Write-back failure modes: missing row, wrong author, or wrong chat. */
export type RewriteApplyError = "not_found" | "forbidden" | "cross_chat";

/** Options for {@link applyRewriteToMessage}. */
export interface RewriteApplyOptions {
  messageId: string;
  /** Chat scope — the target must belong here (cross-chat writes rejected). */
  chatId: string;
  userId: string;
  userRole: string | null;
  content: string;
  config: Config;
}

/**
 * Replace a history message's content with rewritten text.
 * Same-chat scope, author-or-admin ownership, and the route's encryption
 * handling (pre-encrypted passthrough, SMK encrypt when enabled).
 * @param db
 * @param options - target, scope, author, content, config
 * @returns stored content on success, or the failure mode
 */
export async function applyRewriteToMessage(
  db: Kysely<DB>,
  options: RewriteApplyOptions,
): Promise<{ ok: true; content: string } | { ok: false; error: RewriteApplyError }> {
  const { messageId, chatId, userId, userRole, content, config, } = options;
  const msg = await db
    .selectFrom("messages",)
    .select(["id", "actor_id", "chat_id",],)
    .where("id", "=", messageId,)
    .executeTakeFirst();
  if (!msg) { return { ok: false, error: "not_found", }; }
  if (msg.chat_id !== chatId) { return { ok: false, error: "cross_chat", }; }
  if (msg.actor_id !== userId && !can(userRole, "admin.chat",)) {
    return { ok: false, error: "forbidden", };
  }

  const trimmed = content.trim();
  let storedContent = trimmed;
  let storedKeyId: string | null = null;
  let storedPlaintext: string | null = trimmed;
  if (isEncryptedPayload(trimmed,)) {
    storedKeyId = extractKeyIdFromPayload(trimmed,);
    storedPlaintext = null;
  } else if (isEncryptionEnabled()) {
    const enc = await encryptMessageContent({
      database: db,
      chatId: msg.chat_id,
      actorId: msg.actor_id,
      plaintext: trimmed,
      smk: getSmk()!,
      pipeline: {
        threshold: config.encryption.compressThreshold,
        algorithm: config.encryption.compressAlgorithm,
      },
    },);
    storedContent = enc.storedContent;
    storedKeyId = enc.keyId;
  }

  await db
    .updateTable("messages",)
    .set({
      content: storedContent,
      key_id: storedKeyId,
      content_plaintext: storedPlaintext,
      content_encoding: "identity" as ContentEncoding,
      edited_at: new Date().toISOString(),
    },)
    .where("id", "=", messageId,)
    .execute();
  return { ok: true, content: storedContent, };
}
