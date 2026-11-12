// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Offline send gate helpers for chat-send (TASK-pwa-cached-shell-plus-
 * send-queue slices 2-3).
 *
 * Extracted from chat-send.ts so the send method stays a router over gates:
 * enqueue-on-offline (fast path and failure path) plus the document-level
 * listener that reloads the thread when a background drain delivers.
 */
import {
  enqueueOutboxSend,
  isOfflineClassError,
  OUTBOX_DELIVERED_EVENT,
} from "../stores/connection";
import { awaitChatStateAction, } from "./chat-state-global";
import { t, } from "./i18n";
import { log as rootLog, } from "./logger";
import type { ChatState, } from "./types";

const log = rootLog.child({ module: "chat", },);

/**
 * Queue a send for offline replay and keep the optimistic row marked
 * `queued` instead of rolling it back. The connection watcher drains the
 * queue on reconnect with the SAME idempotency key.
 * @param ctx - chat state (activeChat, messages, toast dispatch)
 * @param tempId - the optimistic row to mark queued
 * @param idempotencyKey - the send's key; the replay reuses it verbatim
 * @param buildBody - builds the serialized POST body (encryption included)
 * @returns `true` when queued; `false` when the body could not be built and
 *   the caller must roll back like the online error path
 */
export async function queueOfflineSend(
  ctx: ChatState,
  tempId: string,
  idempotencyKey: string,
  buildBody: () => Promise<string>,
): Promise<boolean> {
  try {
    enqueueOutboxSend({
      chatId: ctx.activeChat ?? "",
      idempotencyKey,
      body: await buildBody(),
    },);

    ctx.messages = ctx.messages.map((m,) => m.id === tempId ? { ...m, status: "queued", } : m);
    ctx.$dispatch?.("show-toast", { type: "info", message: t("toasts.messageQueued",), },);
    return true;
  } catch (error: unknown) {
    log.warn("offline enqueue failed", {
      error: error instanceof Error ? error.message : String(error,),
    },);

    return false;
  }
}

/**
 * Send-failure path: when the thrown error is offline-class (network down /
 * timeout — the request never reached HTTP), enqueue the exact serialized
 * body that failed and keep the optimistic row. HTTP errors carry a status
 * and return false so the caller rolls back as before.
 * @returns `true` when the send was queued (caller keeps the row)
 */
export async function keepFailedSendQueued(
  ctx: ChatState,
  tempId: string,
  idempotencyKey: string,
  sentBody: string | null,
  error: unknown,
): Promise<boolean> {
  if (sentBody === null || !isOfflineClassError(error,)) { return false; }
  return queueOfflineSend(ctx, tempId, idempotencyKey, async () => sentBody,);
}

// A background drain (online event / SW ping / boot) delivers queued sends
// outside any chat-send call. Reload the thread + chat list so the delivered
// rows replace their queued placeholders. Bound ONCE per document (shared
// across bundles), no-op when no chat view is mounted.
const doc = document as Document & { __outboxReloadBound?: boolean };
if (typeof doc.addEventListener === "function" && !doc.__outboxReloadBound) {
  doc.__outboxReloadBound = true;
  doc.addEventListener(OUTBOX_DELIVERED_EVENT, () => {
    void awaitChatStateAction("loadMessages",);
    void awaitChatStateAction("loadChats",);
  },);
}
