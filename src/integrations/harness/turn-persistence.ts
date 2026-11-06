// SPDX-License-Identifier: LGPL-3.0-or-later

/**
 * turn-persistence.ts — persist one harness turn as chat-visible message rows.
 *
 * One assistant row per turn (text, `tool_calls`, `thinking`) and one
 * `tool_result` row per finished tool call. The rows follow the convention
 * `src/generation/generate-route/tool-execution.ts` established: tool results
 * carry `metadata.tool_call_id` / `tool_name` / `tool_error`, content is
 * encrypted through the shared message-encryption path, and the assistant row
 * is the parent of its tool results (here we DO have the assistant id —
 * unlike the LLM path, where the row does not exist yet).
 *
 * The whole turn lands in ONE transaction: either the turn is visible or it
 * is not (no half-persisted tool results).
 */

import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import {
  ContentEncoding,
  MessageContentFormat,
  MessageContentType,
  MessageRole,
  MessageStatus,
  MessageVisibility,
} from "../../db/enums";
import type { DB, } from "../../db/schema";
import { assertValidWrite, } from "../../db/validators/enforce";
import { encryptStoredContent, } from "../../generation/generate-route/tool-result-persist";
import { findByIdempotencyKey, isIdempotencyUniqueViolation, } from "../../routes/messages/swipe-race-insert";
import { safeJsonStringify, } from "../../utils";
import { isTerminalToolStatus, } from "./acp-session-update";
import { type HarnessTurnResult, } from "./adapter-types";
import { type HarnessToolResult, type HarnessTurnTranscript, } from "./turn-transcript";

/** Options for persisting one harness turn. */
export interface PersistHarnessTurnOptions {
  /** The database the rows land in. */
  database: Kysely<DB>;
  /** Chat the turn belongs to. */
  chatId: string;
  /** Actor the turn is attributed to. */
  actorId: string;
  /** Harness profile that produced the turn. */
  profile: string;
  /** The turn's collected transcript. */
  transcript: HarnessTurnTranscript;
  /** The resolved turn (stop reason, usage, session id). */
  turn: HarnessTurnResult;
  /** Idempotency key; a replay with the same key writes nothing. */
  turnKey: string;
  /** Row status; defaults to confirmed, `partial` for an unfinished turn. */
  status?: MessageStatus;
}

/** What one persisted turn wrote. */
export interface PersistedHarnessTurn {
  /** Id of the assistant row. */
  assistantMessageId: string;
  /** Ids of the tool_result rows, in transcript order; empty on a replay. */
  toolResultIds: string[];
}

/** The `tool_calls` payload the message readers parse back. */
interface StoredToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

/** The `tool_calls` JSON shape `src/routes/messages/helpers.ts` parses. */
function storedToolCalls(transcript: HarnessTurnTranscript,): StoredToolCall[] {
  return transcript.toolCalls.map((call,) => ({
    id: call.id,
    type: "function",
    function: { name: call.name, arguments: call.arguments, },
  }));
}

/** The `metadata` JSON a tool_result row carries. */
function toolResultMetadata(result: HarnessToolResult,): string | null {
  const metadata = safeJsonStringify({
    tool_call_id: result.toolCallId,
    tool_name: result.name,
    tool_error: result.error,
  },);

  return metadata.ok ? metadata.value : null;
}

/**
 * Persist one harness turn: the assistant row plus a `tool_result` row per
 * finished tool call. A replay with the same `turnKey` writes nothing and
 * returns the assistant row the first write produced; when a concurrent
 * writer claims the key first, this call replays that row instead of
 * failing.
 * @param options - the turn, its transcript, and the chat binding
 * @returns the assistant row id and the tool_result row ids
 * @throws {Error} when the rows violate the message state machine or the write fails
 */
export async function persistHarnessTurn(
  options: PersistHarnessTurnOptions,
): Promise<PersistedHarnessTurn> {
  const { database, chatId, actorId, profile, transcript, turn, turnKey, } = options;
  const status = options.status ?? MessageStatus.Confirmed;
  const idempotencyKey = `harness:${profile}:${turnKey}`;

  const existingId = await findByIdempotencyKey(database, chatId, idempotencyKey,);
  if (existingId) {
    return { assistantMessageId: existingId, toolResultIds: [], };
  }

  const assistantId = randomUUID();
  const finished = transcript.toolResults.filter((result,) => isTerminalToolStatus(result.status,));

  // Encrypt before the transaction opens: a failed encryption must persist
  // nothing at all. The assistant content goes first on purpose - it is the
  // call that materialises the actor key (ensureActorKey creates it on first
  // use, and actor_keys has no unique index, so two concurrent first-use
  // calls would insert two active keys). After it, the tool results only
  // read that key, so they encrypt concurrently.
  // `Promise.allSettled` is the project shape (bare `Promise.all` is banned
  // by `no-restricted-syntax`); the first rejection rethrows here, so a
  // failed encryption still persists nothing.
  const assistantContent = await encryptStoredContent({
    database,
    chatId,
    actorId,
    plaintext: transcript.text,
  },);

  const settled = await Promise.allSettled(
    finished.map((result,) =>
      encryptStoredContent({
        database,
        chatId,
        actorId,
        plaintext: result.content,
      },)
    ),
  );

  const toolContents: { storedContent: string; storedKeyId: string | null }[] = [];
  for (const entry of settled) {
    if (entry.status === "rejected") { throw entry.reason; }
    toolContents.push(entry.value,);
  }

  const toolCalls = safeJsonStringify(storedToolCalls(transcript,),);
  const thinking = safeJsonStringify(transcript.thinking,);
  const metadata = safeJsonStringify({
    harness: "acp",
    profile,
    acp_session_id: turn.acpSessionId,
    stop_reason: turn.stopReason,
  },);

  assertValidWrite("messages", { status, visibility: MessageVisibility.Visible, },);

  try {
    const toolResultIds = await database.transaction().execute(async (trx,) => {
      await trx.insertInto("messages",).values({
        id: assistantId,
        chat_id: chatId,
        actor_id: actorId,
        parent_id: null,
        role: MessageRole.Assistant,
        content: assistantContent.storedContent,
        key_id: assistantContent.storedKeyId,
        content_format: MessageContentFormat.Markdown,
        content_type: MessageContentType.Text,
        content_encoding: ContentEncoding.Identity,
        status,
        visibility: MessageVisibility.Visible,
        tool_calls: toolCalls.ok ? toolCalls.value : null,
        thinking: thinking.ok ? thinking.value : null,
        metadata: metadata.ok ? metadata.value : null,
        idempotency_key: idempotencyKey,
        token_count_prompt: turn.usage?.inputTokens ?? null,
        token_count_completion: turn.usage?.outputTokens ?? null,
        token_count_total: turn.usage?.totalTokens ?? null,
      },).execute();

      const ids: string[] = [];
      for (const [index, result,] of finished.entries()) {
        const id = randomUUID();
        const content = toolContents[index]!;
        await trx.insertInto("messages",).values({
          id,
          chat_id: chatId,
          actor_id: actorId,
          parent_id: assistantId,
          role: MessageRole.Assistant,
          content: content.storedContent,
          key_id: content.storedKeyId,
          content_format: MessageContentFormat.Markdown,
          content_type: MessageContentType.ToolResult,
          content_encoding: ContentEncoding.Identity,
          status: MessageStatus.Confirmed,
          visibility: MessageVisibility.Visible,
          metadata: toolResultMetadata(result,),
        },).execute();

        ids.push(id,);
      }

      return ids;
    },);

    return { assistantMessageId: assistantId, toolResultIds, };
  } catch (error) {
    // A concurrent writer claimed this turn key between the pre-read and the
    // insert. The enforced index (migration 045) rejected the duplicate, so
    // replay the winner's row instead of surfacing the constraint violation.
    if (!isIdempotencyUniqueViolation(error,)) { throw error; }
    const winnerId = await findByIdempotencyKey(database, chatId, idempotencyKey,);
    if (!winnerId) { throw error; }
    return { assistantMessageId: winnerId, toolResultIds: [], };
  }
}
