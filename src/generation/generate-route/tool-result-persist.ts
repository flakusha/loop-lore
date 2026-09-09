// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Persist LLM tool-call results as chat-visible message rows.
 *
 * BUG-tool-call-result-no-frontend-rendering: tool outputs previously lived
 * only in the in-flight LLM conversation and were never persisted, so the
 * structured tool_calls column was dead data and tool errors were invisible
 * in chat history.
 */

import type { Kysely, } from "kysely";
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
import type { DB, } from "../../db/schema";
import { safeJsonStringify, } from "../../utils";
import type { GenerationMessage, } from "../types";

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

/**
 * Persist tool-call results as chat-visible `tool_result` message rows,
 * linked back to their assistant tool-call rows via `metadata.tool_call_id`.
 * No-op for an empty result list.
 * @param database
 * @param input - Generation request providing `chatId` and `actorId`
 * @param parentMessageId - The persisted assistant message these calls belong to
 * @param toolResults - Tool outputs returned by executeToolCalls
 */
export async function storeToolResultRows(
  database: Kysely<DB>,
  input: { chatId: string; actorId: string },
  parentMessageId: string,
  toolResults: GenerationMessage[],
): Promise<void> {
  for (const result of toolResults) {
    const { storedContent, storedKeyId, } = await encryptStoredContent({
      database,
      chatId: input.chatId,
      actorId: input.actorId,
      plaintext: result.content,
    },);
    const metadata = safeJsonStringify({ tool_call_id: result.tool_call_id ?? null, },);
    await database
      .insertInto("messages",)
      .values({
        id: randomUUID(),
        chat_id: input.chatId,
        actor_id: input.actorId,
        parent_id: parentMessageId,
        role: MessageRole.Assistant,
        content: storedContent,
        key_id: storedKeyId,
        content_type: MessageContentType.ToolResult,
        content_format: MessageContentFormat.Markdown,
        content_encoding: ContentEncoding.Identity,
        status: MessageStatus.Confirmed,
        visibility: MessageVisibility.Visible,
        metadata: metadata.ok ? metadata.value : null,
      },)
      .execute();
  }
}
