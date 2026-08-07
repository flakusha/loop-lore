import type { Kysely, } from "kysely";
import { regenerateMessageVariant, } from "../../chat/service";
import { CancelReason, CancelSource, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { jsonError, jsonResponse, } from "../../routes/http-utils";
import { cancelGenerationByChat, } from "../cancellation-manager";
import { buildStylePrompt, isValidRegenStyle, type RegenStyle, } from "../smart-regen";

// ── Route: Regenerate (validator) ─────────────────────────

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

// ── Route: Regenerate from a message ──────────────────────

/**
 * POST /api/generation/regenerate
 *
 * Cancel current generation and signal frontend to trigger
 * fresh generation for the same parent message.
 */
export async function handleRegenerate(
  body: unknown,
  database: Kysely<DB>,
  auth?: { userId?: string | null; userRole?: string | null },
): Promise<Response> {
  const db = database;
  const input = validateRegenerate(body,);

  if (!input) {
    return jsonError({ message: "chatId is required", status: 400, },);
  }

  const { chatId, style, } = input;
  const userId = auth?.userId ?? null;
  const userRole = auth?.userRole ?? null;

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
    },);

    if (!("ok" in result)) {
      const status = result.code === "forbidden" ? 403 : 404;
      return jsonError({ message: result.message, status, },);
    }

    return jsonResponse({
      ok: true,
      chatId,
      cancelled: wasActive,
      ready: true,
      variantMessageId: result.variantMessageId,
      swipeIndex: result.swipeIndex,
      replayed: result.replayed,
      style: style ?? null,
    },);
  }

  // No messageId → cancel-only path (regenerateResponse).
  const stylePrompt = style ? buildStylePrompt(style,) : null;

  return jsonResponse({
    ok: true,
    chatId,
    cancelled: wasActive,
    ready: true,
    style: style ?? null,
    stylePrompt: stylePrompt || null,
  },);
}
