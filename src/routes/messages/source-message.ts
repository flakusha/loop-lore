// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shared source-message loader for copy-style message operations
 * (forward, AI actions): access check, row fetch, then decrypt with the
 * source chat's keys so ciphertext is never copied verbatim.
 */
import type { Kysely, } from "kysely";
import { checkChatAccess, } from "../../chat/service";
import { decryptMessageContent, getSmk, } from "../../crypto";
import type { DB, } from "../../db/schema";
import { jsonResponse, } from "../http-utils";
import type { HttpStatusCode, } from "../http-utils";
import { serviceErrorToResponse, } from "./helpers";
/** Input for {@link loadSourcePlaintext}. */
export interface SourcePlaintextOpts {
  chatId: string;
  messageId: string;
  actorId: string;
  userRole: string | null;
}
/**
 * Load and decrypt one message the caller may access.
 *
 * Source access is checked before the row fetch so a non-participant
 * cannot probe message ids; a chat mismatch also returns 404.
 * @param database
 * @param opts
 * @returns Plaintext plus sender name, or a ready-to-return error response
 */
export async function loadSourcePlaintext(
  database: Kysely<DB>,
  opts: SourcePlaintextOpts,
): Promise<
  | { ok: true; plaintext: string; senderName: string }
  | { ok: false; response: Response }
> {
  const access = await checkChatAccess(database, opts.chatId, opts.actorId, opts.userRole,);
  if (!access.ok) { return { ok: false, response: serviceErrorToResponse(access.error,), }; }
  const source = await database
    .selectFrom("messages",)
    .select(["id", "chat_id", "actor_id", "content", "content_encoding", "key_id",],)
    .where("id", "=", opts.messageId,)
    .executeTakeFirst();
  if (!source || source.chat_id !== opts.chatId) {
    return {
      ok: false,
      response: jsonResponse({ error: "not_found", message: "Message not found.", }, 404 as HttpStatusCode,),
    };
  }
  let plaintext: string;
  try {
    plaintext = await decryptMessageContent(database, {
      content: source.content,
      content_encoding: source.content_encoding,
      key_id: source.key_id,
      chat_id: source.chat_id,
    }, getSmk()!,);
  } catch {
    return {
      ok: false,
      response: jsonResponse(
        { error: "decrypt_failed", message: "Could not decrypt the source message.", },
        422 as HttpStatusCode,
      ),
    };
  }
  const sender = await database
    .selectFrom("actors",)
    .select("display_name",)
    .where("id", "=", source.actor_id,)
    .executeTakeFirst();
  return { ok: true, plaintext, senderName: sender?.display_name ?? "another chat", };
}
