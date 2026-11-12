// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Outbox depth badge (theme-4 AC4 observability — TASK-pwa-cached-shell-plus-
 * send-queue open item). A persistent shell button showing how many sends sit
 * in the offline outbox; clicking it opens the pending list (content snippet +
 * enqueued time) with per-entry discard behind a confirm().
 *
 * Refreshes from `outbox.depth()` / `outbox.entries()` on the
 * `ll-outbox:changed` document event that connection.ts dispatches on enqueue,
 * drain and discard — the same document-event bridge the delivered reload uses.
 */

import { toDate, } from "./../../utils/date";
import type { OutboxStore, } from "../pwa/outbox-store";
import { outbox, OUTBOX_CHANGED_EVENT, } from "../stores/connection";
import { t, } from "./i18n";
import { jsonParseOr, } from "./json";

/** One pending list row: the queue entry reduced to display fields. */
export interface OutboxBadgeEntryView {
  id: string;
  snippet: string;
  queuedAt: string;
}

/** Alpine component state for the outbox badge. */
export interface OutboxBadgeState {
  /** Queued entry count (badge number; the host hides at 0). */
  depth: number;
  /** Whether the pending list is open. */
  open: boolean;
  /** Pending list rows, oldest first. */
  entries: OutboxBadgeEntryView[];
  /** Alpine init hook: seed state + bind the change event. */
  init(): void;
  /** Re-read depth + entries from the store. */
  refresh(): void;
  /** Toggle the pending list (no-op while the queue is empty). */
  toggle(): void;
  /** Discard one entry behind a confirm(); keeps the list open otherwise. */
  discard(id: string,): void;
}

/** Snippet ceiling — long messages collapse to one ellipsized line. */
const SNIPPET_MAX = 80;

/**
 * Extract a one-line display snippet from a queued POST body.
 * @param body - the exact serialized POST body the send failed with
 * @returns the message content, whitespace-collapsed and ellipsized
 */
export function outboxSnippet(body: string,): string {
  const parsed = jsonParseOr<{ content?: unknown }>(body, {},);
  const content = typeof parsed.content === "string" ? parsed.content : "";
  const oneLine = content.replace(/\s+/g, " ",).trim();
  if (oneLine.length <= SNIPPET_MAX) { return oneLine; }
  return `${oneLine.slice(0, SNIPPET_MAX - 1,)}…`;
}

/**
 * Build the badge state. Split from the globalThis registration so unit tests
 * exercise the same object the template binds, with an injected outbox.
 * @param deps - store seam (the connection singleton in production)
 * @returns the Alpine component state
 */
export function createOutboxBadge(deps: {
  outbox: Pick<OutboxStore, "entries" | "depth" | "discard">;
  confirmFn?: (message: string,) => boolean;
} = { outbox, },): OutboxBadgeState {
  const store = deps.outbox;
  const doConfirm = deps.confirmFn ?? ((message: string,) => confirm(message,));
  const notifyChanged = (): void => {
    if (typeof document === "undefined") { return; }
    document.dispatchEvent(new CustomEvent(OUTBOX_CHANGED_EVENT,),);
  };

  return {
    depth: 0,
    open: false,
    entries: [],

    init() {
      this.refresh();
      if (typeof document !== "undefined") {
        document.addEventListener(OUTBOX_CHANGED_EVENT, () => this.refresh(),);
      }
    },

    refresh() {
      const all = store.entries();
      this.depth = all.length;
      this.entries = all.map((entry,) => ({
        id: entry.id,
        snippet: outboxSnippet(entry.body,),
        queuedAt: Number.isFinite(entry.enqueuedAt,)
          ? toDate(entry.enqueuedAt,).toLocaleString()
          : "",
      }));

      if (this.depth === 0) { this.open = false; }
    },

    toggle() {
      if (this.depth > 0) { this.open = !this.open; }
    },

    discard(id: string,) {
      if (!doConfirm(t("chats.outboxDiscardConfirm",),)) { return; }
      if (store.discard(id,)) { notifyChanged(); }
      this.refresh();
    },
  };
}

globalThis.outboxBadge = (): OutboxBadgeState => createOutboxBadge();
