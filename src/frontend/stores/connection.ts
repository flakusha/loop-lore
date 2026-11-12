// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Connection tracking + outbox drain wiring (TASK-pwa-cached-shell-plus-
 * send-queue slices 2-3).
 *
 * Owns the live outbox instance (localStorage `ll-outbox-v1`) and its replay
 * transport: a drained entry re-POSTs the ORIGINAL serialized body to
 * `/api/v1/chats/:id/messages` with the SAME idempotency key via `apiFetch`
 * (feFetch re-attaches the `Idempotency-Key` header), so the server's intake
 * idempotency (messages.idempotencyKey unique index) makes retries safe.
 *
 * Drain triggers: the browser `online` event, the service worker's
 * connectivity ping (`ll-drain-outbox`, posted after a failed-then-successful
 * view fetch), page boot with a non-empty queue, and the next successful
 * send (`drainOutbox()` exported for chat-send).
 */
import { apiFetch, } from "./../alpine/htmx";
import { t, } from "./../alpine/i18n";
import { log as rootLog, } from "../alpine/logger";
import {
  createOutbox,
  OUTBOX_DRAIN_MESSAGE,
  type OutboxDrop,
  type OutboxEntry,
  type OutboxSendResult,
} from "../pwa/outbox-store";
import { showToast, } from "../ui";

// Re-exports for the chat-send offline helpers (single import site).
export { isOfflineClassError, OUTBOX_DRAIN_MESSAGE, } from "../pwa/outbox-store";

const log = rootLog.child({ module: "connection", },);

/** Event dispatched on `document` after a drain delivers queued sends. */
export const OUTBOX_DELIVERED_EVENT = "ll-outbox:delivered";

/** Event dispatched on `document` whenever the outbox queue mutates. */
export const OUTBOX_CHANGED_EVENT = "ll-outbox:changed";

/** Re-read depth + entries listeners (outbox badge). */
function notifyOutboxChanged(): void {
  if (typeof document === "undefined") { return; }
  document.dispatchEvent(new CustomEvent(OUTBOX_CHANGED_EVENT,),);
}

/** The singleton outbox over browser localStorage (null storage in tests). */
export const outbox = createOutbox({
  storage: typeof localStorage === "undefined" ? null : localStorage,
},);

/** True when the browser reports no network. */
export function isOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}

/**
 * Queue a failed send for later replay (chat-send offline gate).
 * @param input - chat id, the send's idempotency key, the serialized body
 */
export function enqueueOutboxSend(input: {
  chatId: string;
  idempotencyKey: string;
  body: string;
},): void {
  outbox.enqueue(input,);
  notifyOutboxChanged();
}

/** Replay transport: the original POST, byte-identical body, same key. */
async function sendQueued(entry: OutboxEntry,): Promise<OutboxSendResult> {
  const res = await apiFetch(
    `/api/v1/chats/${entry.chatId}/messages`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: entry.body,
      idempotencyKey: entry.idempotencyKey,
    } as Parameters<typeof apiFetch>[1],
  );

  return { ok: res.ok, status: res.status, };
}

const dropMessage = (drop: OutboxDrop,): string =>
  drop.reason === "poison"
    ? t("toasts.outboxPoison", { status: drop.status ?? 0, },)
    : t("toasts.outboxMaxAttempts",);

function surfaceReport(delivered: OutboxEntry[], dropped: OutboxDrop[],): void {
  if (delivered.length > 0) {
    showToast("success", t("toasts.outboxDelivered", { count: delivered.length, },),);
    document.dispatchEvent(
      new CustomEvent(OUTBOX_DELIVERED_EVENT, { detail: { count: delivered.length, }, },),
    );
  }

  for (const drop of dropped) {
    showToast("error", dropMessage(drop,),);
  }
}

/**
 * Drain the outbox through the live request path (single-flighted inside the
 * store). Never rejects — a transport-level blow-up is logged, entries stay.
 */
export function drainOutbox(): Promise<void> {
  return outbox
    .drain(sendQueued,)
    .then((report,) => {
      surfaceReport(report.delivered, report.dropped,);
      // Depth may have moved even when nothing delivered (discards, pauses).
      notifyOutboxChanged();
    },)
    .catch((error: unknown,) => {
      log.warn("outbox drain failed", {
        error: error instanceof Error ? error.message : String(error,),
      },);
    },);
}

function setOffline(value: boolean,): void {
  try {
    const store = Alpine.store("connection",) as { offline?: boolean } | undefined;
    if (store) { store.offline = value; }
  } catch {
    /* store not registered yet — the definition's default holds until it is */
  }
}

/**
 * Bind connectivity listeners and the SW drain ping. Called once from
 * `initAlpineStores`; safe to call again (listeners would duplicate only if
 * the module were re-imported, which the bundler never does).
 */
export function watchConnection(): void {
  if (typeof window === "undefined") { return; }
  setOffline(isOffline(),);

  window.addEventListener("online", () => {
    setOffline(false,);
    void drainOutbox();
  },);

  window.addEventListener("offline", () => {
    setOffline(true,);
  },);

  // SW connectivity ping: the worker sees a successful view fetch after a
  // failed one and nudges every client (the page may have missed `online`).
  if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("message", (event: MessageEvent,) => {
      const data = event.data as { type?: string } | null;
      if (data?.type === OUTBOX_DRAIN_MESSAGE) { void drainOutbox(); }
    },);
  }

  // Boot drain: sends queued before a reload flush once the page is up.
  if (!isOffline() && outbox.depth() > 0) { void drainOutbox(); }
}
