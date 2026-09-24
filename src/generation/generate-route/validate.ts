// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Generation Route — request validation + chat-access authorization.
 *
 * Split from handler.ts (pure refactor, no behavior change): the guard
 * runs server-side before any provider/prompt work — default-deny on
 * missing fields, non-member callers, and malformed optionals.
 */

import type { Kysely, } from "kysely";
import { checkChatAccess, } from "../../chat/service";
import type { DB, } from "../../db/schema";
import { forbiddenResponse, jsonError, requireUserId, } from "../../routes/http-utils";
import type { GenerateRequest, } from "./types";

/** Inputs for {@link validateGenerateRequest}. */
interface ValidateOpts {
  input: GenerateRequest;
  database: Kysely<DB>;
  userId?: string;
  userRole?: string | null;
}

/**
 * Validate required fields and authorize the caller against `chatId`.
 * @returns the error Response to send, or null when the request may proceed
 */
export async function validateGenerateRequest({
  input,
  database,
  userId,
  userRole,
}: ValidateOpts,): Promise<Response | null> {
  // ── Validate required fields ───────────────────────────
  // NOTE: `body as GenerateRequest` cast is unchecked for nested objects.
  // Sub-objects (repetitionDetection, policyDetection, responseLimit) are
  // consumed downstream — invalid values may cause runtime errors.

  if (!input.chatId || typeof input.chatId !== "string") {
    return jsonError({ message: "chatId is required", status: 400, },);
  }
  if (!input.parentMessageId || typeof input.parentMessageId !== "string") {
    return jsonError({ message: "parentMessageId is required", status: 400, },);
  }
  if (!input.actorId || typeof input.actorId !== "string") {
    return jsonError({ message: "actorId is required", status: 400, },);
  }
  if (!input.idempotencyKey || typeof input.idempotencyKey !== "string") {
    return jsonError({ message: "idempotencyKey is required", status: 400, },);
  }

  // ── Authorization: chat access ─────────────────────────
  // Cross-user write guard: only admin, creator, or a participant of
  // `chatId` may trigger generation (BUG-generation-control-plane-routes-lack-authorization).
  const authUserId = requireUserId({ userId, },);
  if (typeof authUserId !== "string") { return authUserId; }
  const access = await checkChatAccess(database, input.chatId, authUserId, userRole,);
  if (!access.ok) { return forbiddenResponse(); }
  if (input.prompt !== undefined && !Array.isArray(input.prompt,)) {
    return jsonError({ message: "prompt must be an array", status: 400, },);
  }
  if (input.provider !== undefined && typeof input.provider !== "string") {
    return jsonError({ message: "provider must be a string", status: 400, },);
  }
  if (input.modelId !== undefined && typeof input.modelId !== "string") {
    return jsonError({ message: "modelId must be a string", status: 400, },);
  }
  return null;
}
