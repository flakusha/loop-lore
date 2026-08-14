// src/frontend/alpine/notifications.ts
//
// In-app chat notifications. A single NotificationsManager opens an SSE
// stream (`/api/activity/stream`) AND polls `/api/chats/activity`. Both
// read the same server source, so they revalidate each other: a dropped
// SSE connection is repaired by the next poll, a missed poll is covered
// by the next SSE event. Unseen counts drive sidebar/chat-list badges
// and a toast when a message lands in a chat the user isn't viewing.
import { ActivitySnapshot, } from "../../validation/schemas/responses";
import { jsonParseOr, } from "./json";
import { parseOr, } from "./validation";

interface ActivityEntry {
  unseenCount: number;
  lastMessageCreatedAt: string | null;
  chatName: string;
}

interface ManagerState {
  unseen: Record<string, number>;
  activeChatId: string | null;
}

const POLL_INTERVAL_MS = 15_000;

/**
 * Coordinates SSE + polling and reflects unseen counts into the DOM.
 */
export class NotificationsManager {
  private state: ManagerState = { unseen: {}, activeChatId: null, };
  private es: EventSource | null = null;
  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private started = false;
  private syncHandler: (() => void) | null = null;
  private beforeUnloadHandler: (() => void) | null = null;

  start(): void {
    if (this.started) { return; }
    this.started = true;

    this.openStream();
    this.poll();
    this.pollTimer = setInterval(() => this.poll(), POLL_INTERVAL_MS,);

    this.syncHandler = () => this.syncFromDom();
    this.beforeUnloadHandler = () => this.stop();
    document.addEventListener("htmx:afterSwap", this.syncHandler,);
    window.addEventListener("beforeunload", this.beforeUnloadHandler,);
  }

  stop(): void {
    this.es?.close();
    this.es = null;
    if (this.pollTimer) { clearInterval(this.pollTimer,); }
    this.pollTimer = undefined;
    if (this.syncHandler) {
      document.removeEventListener("htmx:afterSwap", this.syncHandler,);
      this.syncHandler = null;
    }
    if (this.beforeUnloadHandler) {
      window.removeEventListener("beforeunload", this.beforeUnloadHandler,);
      this.beforeUnloadHandler = null;
    }
    this.started = false;
  }

  /** Mark a chat read (POST) and clear its local unseen state. */
  async markRead(chatId: string,): Promise<void> {
    try {
      await apiFetch(`/api/v1/chats/${chatId}/mark-read`, { method: "PUT", },);
    } catch {
      // network error — local state still updated below
    }
    this.state.unseen[chatId] = 0;
    this.renderBadge(chatId,);
  }

  setActiveChat(chatId: string | null,): void {
    this.state.activeChatId = chatId;
  }

  /** Read unseen count for a specific chat. */
  getUnseenCount(chatId: string,): number {
    return this.state.unseen[chatId] ?? 0;
  }

  /** Read all unseen counts (for components that need the full map). */
  getAllUnseen(): Record<string, number> {
    return { ...this.state.unseen, };
  }

  /** Clear unseen count for a chat locally (without POST). */
  clearUnseen(chatId: string,): void {
    this.state.unseen[chatId] = 0;
    this.renderBadge(chatId,);
  }

  private openStream(): void {
    if (typeof EventSource === "undefined") { return; }
    try {
      this.es = new EventSource("/api/activity/stream",);
      this.es.addEventListener("activity", (ev,) => {
        const data = parseOr(ActivitySnapshot, jsonParseOr(ev.data, null,), { chats: {}, },);
        this.applySnapshot(data.chats,);
      },);
      this.es.addEventListener("error", () => {
        // Browser auto-reconnects; polling covers the gap.
      },);
    } catch {
      // SSE unavailable — polling alone is sufficient.
    }
  }

  private async poll(): Promise<void> {
    try {
      const res = await apiFetch("/api/chats/activity",);
      if (!res.ok) { return; }
      const data = parseOr(ActivitySnapshot, await res.json(), { chats: {}, },);
      this.applySnapshot(data.chats,);
    } catch {
      // transient — next tick retries
    }
  }

  /** Merge a server snapshot into local state and update UI. */
  private applySnapshot(chats: Record<string, ActivityEntry>,): void {
    for (const [chatId, entry,] of Object.entries(chats,)) {
      const prev = this.state.unseen[chatId] ?? 0;
      const next = entry.unseenCount ?? 0;
      this.state.unseen[chatId] = next;
      this.renderBadge(chatId,);

      // Toast only on a genuine increase in a chat not currently open.
      if (next > prev && chatId !== this.state.activeChatId) {
        showToast("info", `New message in ${entry.chatName ?? "a chat"}`,);
      }
    }
  }

  private renderBadge(chatId: string,): void {
    const host = document.querySelector<HTMLElement>(`[data-chat-id="${CSS.escape(chatId,)}"]`,);
    if (!host) { return; }

    const count = this.state.unseen[chatId] ?? 0;
    const existing = host.querySelector<HTMLElement>(".badge",);

    if (count > 0) {
      const badge = existing ?? document.createElement("span",);
      badge.className = "badge unread";
      badge.textContent = count > 99 ? "99+" : String(count,);
      if (!existing) { host.append(badge,); }
      host.classList.add("has-unread",);
      return;
    }

    existing?.remove();
    host.classList.remove("has-unread",);
  }

  /** Re-read the active chat from the DOM after an htmx swap. */
  private syncFromDom(): void {
    const open = document.querySelector<HTMLElement>("[data-chat-id].active, [data-active-chat]",);
    const id = open?.dataset.chatId ?? open?.dataset.activeChat ?? null;
    this.setActiveChat(id,);
    if (id) {
      void (async () => {
        try {
          await this.markRead(id,);
        } catch {
          /* non-critical */
        }
      })();
    }
  }
}

const manager = new NotificationsManager();
(globalThis as { notifications?: NotificationsManager }).notifications = manager;

document.addEventListener("alpine:init", () => {
  manager.start();
},);
