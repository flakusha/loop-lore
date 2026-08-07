import type { Kysely, } from "kysely";
import { CancelReason, CancelSource, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { jsonError, jsonResponse, } from "../../routes/http-utils";
import { cancelGenerationByChat, listActiveGenerations, } from "../cancellation-manager";

// ── Route: Cancel generation (validator) ───────────────────

function validateCancel(
  body: unknown,
): { chatId?: string; attemptId?: string; reason?: string; source?: string; detail?: string } | null {
  if (!body || typeof body !== "object") { return null; }
  const b = body as Record<string, unknown>;
  if (b.chatId !== undefined && typeof b.chatId !== "string") { return null; }
  if (b.attemptId !== undefined && typeof b.attemptId !== "string") { return null; }
  if (b.reason !== undefined && typeof b.reason !== "string") { return null; }
  if (b.source !== undefined && typeof b.source !== "string") { return null; }
  if (b.detail !== undefined && typeof b.detail !== "string") { return null; }
  return {
    chatId: b.chatId,
    attemptId: b.attemptId,
    reason: b.reason,
    source: b.source,
    detail: b.detail,
  };
}

// ── Route: Cancel generation ──────────────────────────────

/**
 * POST /api/generation/cancel
 *
 * Cancel a running generation. Body can specify:
 *   { chatId: string }               — cancel by chat
 *   { attemptId: string }            — cancel by attempt ID
 *   { reason?: string, source?: string, detail?: string }
 */
export function handleCancelGeneration(body: unknown, database: Kysely<DB>,): Response {
  const db = database;
  const input = validateCancel(body,);

  if (!input) {
    return jsonError({ message: "Invalid request body", status: 400, },);
  }

  const reason = (input.reason ?? CancelReason.UserCancel) as CancelReason;
  const source = (input.source ?? CancelSource.User) as CancelSource;
  const detail = input.detail ?? "User requested cancellation";
  const chatId = input.chatId;
  const attemptId = input.attemptId;

  if (!chatId && !attemptId) {
    return jsonError({ message: "Either chatId or attemptId is required", status: 400, },);
  }

  const resolvedChatId = chatId ??
    (() => {
      for (const gen of listActiveGenerations()) {
        if (gen.attemptId === attemptId) { return gen.chatId; }
      }
      return null;
    })();

  if (!resolvedChatId) {
    return jsonError({ message: "No active generation found for the given ID", status: 404, },);
  }

  const isCancelled = cancelGenerationByChat({ db, chatId: resolvedChatId, reason, source, detail, },);

  if (!isCancelled) {
    return jsonError({ message: "No active generation found or already cancelled", status: 404, },);
  }

  return jsonResponse({
    ok: true,
    chatId: resolvedChatId,
    reason,
    source,
    detail,
  },);
}
