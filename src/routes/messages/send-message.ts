// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/routes/messages/send-message.ts — the storage phase of the send-message
// pipeline as a callable service.
//
// Split from the POST /chats/:id/messages handler (pure refactor, no behavior
// change): intake/gates live in `send-intake.ts` (250L size gate); this module
// persists the prepared message and runs the post-insert effects. The HTTP
// route and the loop-lore-facade `chat.send` op both call `sendUserMessage`.

import type { Kysely, } from "kysely";
import { getConfigValue, } from "../../admin/config";
import type { AsyncStore, } from "../../async/store";
import { computeContextStats, } from "../../chat";
import { updateMessageVisibility, } from "../../chat/service";
import type { Config, } from "../../config/schema";
import type { ContentEncoding, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { uid, } from "../../utils";
import type { MessageCreateBody, } from "../../validation/schemas";
import { jsonCreated, } from "../http-utils";
import { createResponse, } from "./create-response";
import { attachAttachmentsOrForbidden, } from "./guards";
import { persistInitiative, } from "./initiative";
import { insertUserMessageRow, } from "./insert-message";
import { persistMentions, prepareContentStorage, } from "./post";
import { runPostInsertChatEffects, } from "./post-insert";
import { maybeAutoReply, } from "./reply";
import { prepareUserMessage, } from "./send-intake";

/** Everything the send pipeline needs; identity arrives pre-extracted. */
export interface SendMessageParams {
  database: Kysely<DB>;
  config: Config;
  /** Async request-result store; threaded to routes that emit a requestId. */
  asyncStore?: AsyncStore;
  /** The sending user (actors.id === users.id for user principals). */
  userId: string;
  userRole: string | null;
  chatId: string;
  /** Route-validated body (MessageCreateBody.static); trimmed in-pipeline. */
  body: typeof MessageCreateBody.static;
  /**
   * The caller's request — `maybeAutoReply` reads `x-request-id` off its
   * headers. The facade supplies a synthetic POST; route callers pass theirs.
   */
  request: Request;
}

/**
 * Send one user message into a chat and attempt the auto-reply.
 *
 * Guard ordering lives in `send-intake.ts` (access/mute/idempotency/VN before
 * any side effect). The parentId IDOR guard runs INSIDE the insert
 * transaction (BUG-cross-chat-parentId-IDOR); the mapped guard Responses
 * carry their own 403/404/503 status, so no Elysia `set.status` coupling is
 * needed here.
 * @param params - database/config handle, identity, chat id, body, request
 * @returns the route's Response (201 created, replay, or a mapped error)
 */
export async function sendUserMessage(params: SendMessageParams,): Promise<Response> {
  const { database, config, asyncStore, userId: actorId, userRole, chatId, body, request, } = params;

  const intake = await prepareUserMessage({ database, config, userId: actorId, userRole, chatId, body, },);
  if (!intake.ok) { return intake.response; }
  const {
    effectiveBody,
    assetMentionIds,
    filteredContent,
    hasProfanity,
    isInitiative,
    effectiveContent,
    storableContent,
  } = intake.prepared;

  void effectiveBody;

  const { storedContent, contentEncoding, storedKeyId, storedPlaintext, } = await prepareContentStorage(
    database,
    config,
    chatId,
    actorId,
    storableContent,
  );

  const id = uid();
  const parentId = body.parentId ?? null;
  const inserted = await insertUserMessageRow({
    database,
    chatId,
    actorId,
    id,
    parentId,
    storedContent,
    storedKeyId,
    storedPlaintext,
    contentEncoding: contentEncoding as ContentEncoding,
    idempotencyKey: body.idempotencyKey ? body.idempotencyKey : null,
  },);

  if (!inserted.ok) { return inserted.response; }

  // ── Idempotency race replay (migration 045) ───────────────
  // A concurrent POST with the same key committed first; the unique
  // index rejected our insert and the helper replayed the winner.
  // Respond with the winning row before ANY post-insert side effect
  // (attachments, mentions, moderation, auto-reply) can double-fire.
  if (inserted.replayedId) {
    return jsonCreated({ id: inserted.replayedId, context: {}, },);
  }

  const explicitAttachments = body.attachments ?? [];
  const mentionedAttachments = assetMentionIds
    .filter((assetId,) => !explicitAttachments.some((a,) => a.assetId === assetId))
    .map((assetId,) => ({ assetId, }));

  const attachments = [...explicitAttachments, ...mentionedAttachments,];

  // ── Profanity moderation gate ─────────────────────────
  if (hasProfanity) {
    const profanityFilter = (await getConfigValue(database, "profanity_filter",)) === "true";
    if (profanityFilter) {
      await updateMessageVisibility(database, id, "hidden_by_moderator", "profanity",);
    }
  }

  if (attachments && attachments.length > 0) {
    const attachmentRejection = await attachAttachmentsOrForbidden(database, id, attachments, actorId,);
    if (attachmentRejection) { return attachmentRejection; }
  }

  // ── Persist initiative claim ────────────────────────────────
  if (isInitiative) {
    await persistInitiative(database, chatId, actorId,);
  }

  // ── Persist @mentions ─────────────────────────────────────
  await persistMentions(database, chatId, actorId, id, filteredContent,);

  // ── Post-insert chat effects: rename, advisory AUX title, scene transitions ──
  const chatRecord = await database
    .selectFrom("chats",)
    .select(["name", "mode", "current_location_id", "world_id", "created_by",],)
    .where("id", "=", chatId,)
    .executeTakeFirst();

  await runPostInsertChatEffects(database, config, chatId, actorId, id, effectiveContent, chatRecord,);

  // ── Context window stats ─────────────────────────────────────
  const tokenRow = await database
    .selectFrom("messages",)
    .select(database.fn.sum("token_count_total",).as("total_tokens",),)
    .where("chat_id", "=", chatId,)
    .executeTakeFirst();

  const usedTokens = Number(tokenRow?.total_tokens ?? 0,);
  const context = computeContextStats(
    [{ content: "", tokenCount: usedTokens, },],
  );

  // ── Auto-generation / assistant reply ──────────────────────
  const reply = await maybeAutoReply(
    database,
    config,
    chatId,
    actorId,
    id,
    effectiveContent,
    request,
    asyncStore,
  );

  return await createResponse(reply, id, context,);
}
