// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import {
  checkChatAccess,
  regenerateMessageVariant,
  regenIdempotencyKey,
} from "../../chat/service";
import type { RegenerateVariantResult, } from "../../chat/service";
import type { Config, } from "../../config/schema";
import { CancelReason, CancelSource, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";
import { forbiddenResponse, jsonError, jsonResponse, requireUserId, } from "../../routes/http-utils";
import { cancelGenerationByChat, } from "../cancellation-manager";
import { handleGenerate, } from "../generate-route";
import { isValidRegenStyle, type RegenStyle, VALID_REGEN_STYLES, } from "../smart-regen";

// ── Route: Regenerate (validator) ─────────────────────────

/**
 * @param body
 */
function validateRegenerate(
  body: unknown,
): { chatId: string; messageId?: string; style?: RegenStyle } | null {
  if (!body || typeof body !== "object") { return null; }
  const b = body as Record<string, unknown>;
  if (typeof b.chatId !== "string" || !b.chatId) { return null; }
  let messageId: string | undefined;
  if (b.messageId !== undefined && b.messageId !== null) {
    if (typeof b.messageId !== "string" || !b.messageId) { return null; }
    messageId = b.messageId;
  }
  let style: RegenStyle = null;
  if (b.style !== undefined && b.style !== null) {
    if (!isValidRegenStyle(b.style,)) { return null; }
    style = b.style;
  }
  return { chatId: b.chatId, messageId, style, };
}

/**
 * Best-effort logging for the variant-fill degradation path. The global
 * logger is absent in unit-test scope (getLogger() throws) and a missing
 * log line must not fail the request — the failed generation attempt row
 * and the still-pending variant already record the failure.
 * @param message
 */
function logDegradation(message: string,): void {
  try {
    getLogger().child({ module: "generation.regenerate", },).error(message,);
  } catch {
    // Logger not initialized — nothing else to record.
  }
}

/**
 * Drive the manual generation pipeline for a pending regen variant row. The
 * variant row is filled in place (targetMessageId) and the validated style
 * rides on the LLM payload via its system message. Any pipeline failure
 * (provider not configured, LLM error, access race) surfaces as a non-ok
 * Response for the caller to log — the regenerate route's own response
 * contract is unchanged, the variant row simply stays pending.
 * @param database
 * @param config
 * @param chatId
 * @param parentId
 * @param variant
 * @param userId
 * @param userRole
 */
async function generateVariant(
  database: Kysely<DB>,
  config: Config | undefined,
  chatId: string,
  parentId: string,
  variant: { variantMessageId: string; actorId: string; style: RegenStyle },
  userId: string | null,
  userRole: string | null,
): Promise<Response> {
  try {
    return await handleGenerate({
      body: {
        chatId,
        parentMessageId: parentId,
        actorId: variant.actorId,
        // Same key the variant row carries: replays are deduped while the
        // generation is in flight, and a completed attempt never blocks a
        // fresh variant with the same parent + style.
        idempotencyKey: regenIdempotencyKey(parentId, variant.style,),
        stream: false,
        targetMessageId: variant.variantMessageId,
        // Validated by validateRegenerate upstream; asserted for the cast.
        regenStyle: variant.style as RegenStyle,
      },
      database,
      config,
      userId: userId ?? undefined,
      userRole,
    },);
  } catch (error) {
    logDegradation(`Regen variant generation threw: ${String(error,)}`,);
    return jsonError({ message: "Generation failed", status: 500, },);
  }
}

// ── Route: Regenerate from a message ──────────────────────

/**
 * POST /api/generation/regenerate
 *
 * Cancel current generation and signal frontend to trigger
 * fresh generation for the same parent message.
 * @param body
 * @param database
 * @param auth
 * @param auth.userId
 * @param auth.userRole
 * @param config
 */
export async function handleRegenerate(
  body: unknown,
  database: Kysely<DB>,
  auth?: { userId?: string | null; userRole?: string | null },
  config?: Config,
): Promise<Response> {
  const db = database;
  const input = validateRegenerate(body,);

  if (!input) {
    // Distinguish an unknown style from a missing chatId so callers get an
    // actionable 400 (BUG-smart-regen-style-not-threaded-through test item).
    const raw = body as Record<string, unknown> | null;
    const styleRejected = raw !== null && typeof raw === "object" &&
      raw.style !== undefined && raw.style !== null && !isValidRegenStyle(raw.style,);
    if (styleRejected) {
      return jsonError({
        message: `Invalid style. Valid styles: ${Object.keys(VALID_REGEN_STYLES,).join(", ",)}`,
        status: 400,
      },);
    }
    return jsonError({ message: "chatId is required", status: 400, },);
  }

  const { chatId, style, } = input;
  const userId = auth?.userId ?? null;
  const userRole = auth?.userRole ?? null;

  // Authorization: only admin, creator, or a participant may regenerate a
  // chat's message (BUG-generation-control-plane-routes-lack-authorization).
  const authUserId = requireUserId({ userId, },);
  if (typeof authUserId !== "string") { return authUserId; }
  const access = await checkChatAccess(db, chatId, authUserId, userRole,);
  if (!access.ok) { return forbiddenResponse(); }

  const wasActive = cancelGenerationByChat({
    db,
    chatId,
    reason: CancelReason.UserCancel,
    source: CancelSource.User,
    detail: "User requested regeneration (replacing existing response)",
  },);

  // messageId present → create a new sibling variant (swipe/replay branch).
  if (input.messageId) {
    const result = await regenerateMessageVariant(db, {
      chatId,
      messageId: input.messageId,
      userId,
      userRole,
      style,
    },);

    if (!("ok" in result)) {
      const status = result.code === "forbidden" ? 403 : 404;
      return jsonError({ message: result.message, status, },);
    }

    // Drive the generation for the freshly created variant
    // (BUG-smart-regen-style-not-threaded-through): the variant row used to
    // stay an unfilled placeholder because no downstream pass consumed it.
    // Running the pipeline here puts the style hint on the actual LLM payload
    // and fills the row before the response returns. Replays skip the call
    // (a generation for that pending row already ran), and root-message
    // forks (no parent to hang the request on) keep the placeholder-only
    // behavior. Provider/pipeline failures degrade to the same response —
    // logged, with the failure recorded on the generation attempt row.
    const okResult = result as Extract<RegenerateVariantResult, { ok: true }>;
    if (!okResult.replayed && okResult.parentId !== null) {
      const genResponse = await generateVariant(
        db,
        config,
        chatId,
        okResult.parentId,
        {
          variantMessageId: okResult.variantMessageId,
          actorId: okResult.actorId,
          style: okResult.style as RegenStyle,
        },
        userId,
        userRole,
      );
      if (!genResponse.ok) {
        logDegradation(
          `Regen variant generation did not complete (chat ${chatId}, variant ${okResult.variantMessageId}, status ${genResponse.status})`,
        );
      }
    }

    return jsonResponse({
      ok: true,
      chatId,
      cancelled: wasActive,
      ready: true,
      variantMessageId: result.variantMessageId,
      swipeIndex: result.swipeIndex,
      replayed: result.replayed,
      style: result.style,
    },);
  }

  // No messageId → cancel-only path (regenerateResponse). The `style`
  // hint is echoed so callers can confirm what was requested; without a
  // messageId there is no variant row and hence no generation to drive.
  return jsonResponse({
    ok: true,
    chatId,
    cancelled: wasActive,
    ready: true,
    style: style ?? null,
  },);
}
