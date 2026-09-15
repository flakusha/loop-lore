// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Encryption helper for persisting LLM tool-call results as chat-visible
 * message rows.
 *
 * BUG-tool-call-result-no-frontend-rendering: tool outputs previously lived
 * only in the in-flight LLM conversation and were never persisted, so the
 * structured tool_calls column was dead data and tool errors were invisible
 * in chat history. Row insertion lives in `tool-execution.ts`
 * (`persistToolResults`) and `persist.ts` (`storeGenerationResult`).
 */

import type { Kysely, } from "kysely";
import { encryptMessageContent, getSmk, isEncryptionEnabled, } from "../../crypto";
import type { DB, } from "../../db/schema";

/**
 * Encrypt message content when server-side encryption is enabled.
 * @param root0
 * @param root0.database
 * @param root0.chatId
 * @param root0.actorId
 * @param root0.plaintext
 * @returns The stored (possibly encrypted) content and its key id
 */
export async function encryptStoredContent({
  database,
  chatId,
  actorId,
  plaintext,
}: {
  database: Kysely<DB>;
  chatId: string;
  actorId: string;
  plaintext: string;
},): Promise<{ storedContent: string; storedKeyId: string | null }> {
  if (!isEncryptionEnabled()) {
    return { storedContent: plaintext, storedKeyId: null, };
  }
  const smk = getSmk()!;
  const enc = await encryptMessageContent({
    database,
    chatId,
    actorId,
    plaintext,
    smk,
  },);
  return { storedContent: enc.storedContent, storedKeyId: enc.keyId, };
}
