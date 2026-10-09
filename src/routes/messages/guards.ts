// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
/**
 * Shared guard helpers for the message-create route.
 */

import type { Kysely, } from "kysely";
import { isMuted, } from "../../chat/moderation";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";
import { jsonParseOr, safeJsonStringify, } from "../../utils";
import { checkPromptInjection, } from "../../validation/prompt-injection";
import { conflictResponse, jsonResponse, } from "../http-utils";
import type { HttpStatusCode, } from "../http-utils";
import { AttachmentOwnershipError, } from "./attachment-ownership";
import { attachMessageAttachments, } from "./post";

/** Attachment descriptor shape, matching MessageCreateBody.attachments. */
interface MessageAttachment {
  assetId: string;
  order?: number;
  caption?: string;
  label?: string;
}

/**
 * Two-step prompt/message injection validation for user-submitted content.
 *
 * Deterministic signal scan always; aux-LLM confirm only when suspicious.
 * Blocking requires both steps to agree, and the whole gate is opt-in via
 * the moderation hooks config (hooks.enableModerationHooks, default on).
 * @param config
 * @param database
 * @param content
 * @param userId
 * @param chatId
 * @returns 403 response when the message must be rejected; null to proceed
 */
export async function enforceInjectionGate(
  config: Config,
  database: Kysely<DB>,
  content: string,
  userId: string,
  chatId: string,
): Promise<Response | null> {
  if (config.hooks?.enableModerationHooks === false) { return null; }
  const injection = await checkPromptInjection(content, {
    config,
    db: database,
    userId,
    chatId,
  },);

  if (injection.verdict !== "blocked") { return null; }
  getLogger().child({ module: "messages/create", },).warn(
    "Message blocked by injection validation",
    { chatId, signals: injection.signals, },
  );

  return jsonResponse(
    { error: "injection_detected", message: "Message rejected: prompt injection detected.", },
    403 as HttpStatusCode,
  );
}

/**
 * Attach validated message attachments to a freshly inserted message.
 * Attachment ownership violations are surfaced as a 403 response; other
 * failures rethrow.
 * @param database
 * @param messageId
 * @param attachments
 * @param ownerId
 * @returns 403 response on ownership violation; null on success
 * @throws {Error}
 */
export async function attachAttachmentsOrForbidden(
  database: Kysely<DB>,
  messageId: string,
  attachments: MessageAttachment[],
  ownerId: string,
): Promise<Response | null> {
  try {
    await attachMessageAttachments(database, messageId, attachments, ownerId,);
    return null;
  } catch (err) {
    if (err instanceof AttachmentOwnershipError) {
      const payload = safeJsonStringify({ error: "forbidden", message: err.message, },);
      return new Response(payload.ok ? payload.value : "{}", {
        status: 403 as HttpStatusCode,
        headers: { "Content-Type": "application/json", },
      },);
    }

    throw err;
  }
}

/**
 * Mute gate (TASK-chat-feature-moderation AC3): suppress a muted
 * participant's inbound traffic. Reads the live `muted_until` stamp on
 * `chat_participants` and defers to the pure `isMuted` predicate.
 * @param database
 * @param chatId
 * @param actorId Sending actor (session user).
 * @returns 403 response while the sender is muted; null to proceed.
 */
export async function enforceMuteGate(
  database: Kysely<DB>,
  chatId: string,
  actorId: string,
): Promise<Response | null> {
  const mutedRows = await database
    .selectFrom("chat_participants",)
    .select("muted_until",)
    .where("chat_id", "=", chatId,)
    .where("actor_id", "=", actorId,)
    .limit(1,)
    .execute();

  if (!isMuted(mutedRows[0] ?? null, Date.now(),)) { return null; }
  getLogger().child({ module: "messages/create", },).info(
    "Message rejected: sender is muted",
    { chatId, actorId, },
  );

  return jsonResponse(
    { error: "forbidden", message: "You are muted in this chat", },
    403 as HttpStatusCode,
  );
}

/**
 * Shared 409 body. One source for the choice and question branches so the two
 * cannot drift apart in wording.
 * @param kind
 * @returns {string}
 */
function VN_DECISION_MESSAGE(kind: "choice" | "question",): string {
  return `Resolve the pending VN ${kind} before sending a message. Skip it from the card to continue.`;
}

/**
 * VN decision gate: while a chat has an unresolved branching choice or Q&A
 * question, the player must decide before free-sending a message.
 *
 * Server-side and authoritative. A client-only gate is bypassable —
 * `chat-quick-replies.ts` posts through the same `sendMessage` path without
 * going through the composer UI at all.
 *
 * Scope is the whole chat, not the current scene: the send path carries no
 * scene index to scope against, and a row left `available` at scene 0 is still
 * dangling at scene 12.
 *
 * Cost control: one by-primary-key read of `chats.gm_config`, early-out when the
 * chat never opted in. Deliberately does NOT widen `checkChatAccess`'s select to
 * reuse its chats row — it has dozens of importers and trading a shared
 * contract for one by-pk column read is not worth it.
 * @param database
 * @param chatId
 * @param actorId Sending actor (session user).
 * @returns 409 response while a decision is pending; null to proceed.
 */
export async function enforceVnDecisionGate(
  database: Kysely<DB>,
  chatId: string,
  actorId: string,
): Promise<Response | null> {
  const chat = await database
    .selectFrom("chats",)
    .select("gm_config",)
    .where("id", "=", chatId,)
    .executeTakeFirst();

  if (!chat?.gm_config) { return null; }

  const gmConfig = jsonParseOr<{ vnChoicesEnabled?: boolean }>(chat.gm_config, {},);
  if (!gmConfig.vnChoicesEnabled) { return null; }

  // Both tables carry a parallel `status` column defaulting to 'available', so
  // the gate has to consult both. `dismissed` rows are resolved and must not
  // block. Sequential awaits, not Promise.all: the project bans it (an
  // unhandled rejection here would silently unblock the gate) and these are
  // two indexed LIMIT 1 lookups on the same connection anyway.
  const pendingChoices = await database
    .selectFrom("vn_choices",)
    .select("id",)
    .where("chat_id", "=", chatId,)
    .where("status", "=", "available",)
    .limit(1,)
    .execute();

  if (pendingChoices.length > 0) {
    getLogger().child({ module: "messages/create", },).info(
      "Message rejected: a VN choice is still pending",
      { chatId, actorId, },
    );

    return conflictResponse(VN_DECISION_MESSAGE("choice",),);
  }

  const pendingQuestions = await database
    .selectFrom("vn_questions",)
    .select("id",)
    .where("chat_id", "=", chatId,)
    .where("status", "=", "available",)
    .limit(1,)
    .execute();

  if (pendingQuestions.length === 0) { return null; }

  getLogger().child({ module: "messages/create", },).info(
    "Message rejected: a VN question is still pending",
    { chatId, actorId, },
  );

  return conflictResponse(VN_DECISION_MESSAGE("question",),);
}
