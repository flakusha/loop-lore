// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
/**
 * Shared guard helpers for the message-create route.
 */

import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";
import { safeJsonStringify, } from "../../utils";
import { checkPromptInjection, } from "../../validation/prompt-injection";
import { jsonResponse, } from "../http-utils";
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
