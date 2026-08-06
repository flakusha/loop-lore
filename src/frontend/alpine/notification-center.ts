// src/frontend/alpine/notification-center.ts
//
// Notification center: full-page list of the user's notifications (read and
// unread) with an All/Unread list toggle, mark-read-on-open, a "mark all read"
// action, and per-type mute filters that persist against the user's
// notification preferences. The header bell dropdown (user-notifications.ts)
// stays the lightweight chat-header surface; this component backs the
// standalone `/views/notifications` page.

import { jsonBody, jsonParseOr, } from "./json";
import type { NotificationCenterItem, NotificationCenterState, } from "./types";

const TYPE_ICONS: Record<string, string> = {
  mention: "@",
  quest_update: "Q",
  item_offer: "$",
  world_event: "W",
  chat_invite: "→",
  character_update: "C",
  gm_action: "G",
  system: "i",
  blog_post: "B",
  blog_comment: "✎",
};

const TYPE_LABELS: Record<string, string> = {
  mention: "Mention",
  quest_update: "Quest update",
  item_offer: "Item offer",
  world_event: "World event",
  chat_invite: "Chat invite",
  character_update: "Character update",
  gm_action: "GM action",
  system: "System",
  blog_post: "Blog post",
  blog_comment: "Blog comment",
};

globalThis.notificationCenter = function(): NotificationCenterState {
  return {
    loaded: false,
    saving: false,
    items: [] as NotificationCenterItem[],
    filter: "all",
    showFilters: false,
    prefs: {} as Record<string, boolean>,
    types: Object.keys(TYPE_LABELS,).map((key,) => ({ key, label: TYPE_LABELS[key] ?? key, })),

    init() {
      void this.refresh();
      void this.loadPrefs();
    },

    async refresh() {
      try {
        const res = await fetch("/api/notifications",);
        if (!res.ok) { return; }
        const data = jsonParseOr<{ items: NotificationCenterItem[] }>(await res.text(), { items: [], },);
        this.items = data.items ?? [];
        this.loaded = true;
      } catch {
        /* ignore */
      }
    },

    /** Notifications visible under the active filter. */
    visible() {
      return this.filter === "all" ? this.items : this.items.filter((n,) => !n.read,);
    },

    /** Number of unread notifications across the whole list. */
    unreadCount() {
      return this.items.filter((n,) => !n.read,).length;
    },

    /** Mark-read on open, then follow the notification link when present. */
    async onOpen(item: NotificationCenterItem,) {
      if (!item.read) {
        item.read = 1;
        try {
          await fetch(`/api/notifications/${item.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json", },
            body: jsonBody({ read: true, },),
          },);
        } catch {
          /* ignore */
        }
      }
      if (item.link) { globalThis.location.assign(item.link,); }
    },

    /** Mark a single notification read without navigating. */
    async markRead(id: string,) {
      try {
        await fetch(`/api/notifications/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({ read: true, },),
        },);
      } catch {
        /* ignore */
      }
      const item = this.items.find((n,) => n.id === id,);
      if (item) { item.read = 1; }
    },

    async markAllRead() {
      try {
        await fetch("/api/notifications/read-all", { method: "PATCH", },);
      } catch {
        /* ignore */
      }
      this.items = this.items.map((n,) => ({ ...n, read: 1, }),);
    },

    async loadPrefs() {
      try {
        const res = await fetch("/api/notifications/preferences",);
        if (!res.ok) { return; }
        const data = jsonParseOr<{ enabled: Record<string, boolean> }>(await res.text(), { enabled: {}, },);
        this.prefs = data.enabled ?? {};
      } catch {
        /* ignore */
      }
    },

    /** Flip the mute setting for one notification type. */
    async toggleType(key: string,) {
      this.prefs = { ...this.prefs, [key]: !this.prefs[key], };
      await this.savePrefs();
    },

    async savePrefs() {
      this.saving = true;
      try {
        await fetch("/api/notifications/preferences", {
          method: "PATCH",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({ enabled: this.prefs, },),
        },);
      } catch {
        /* ignore */
      } finally {
        this.saving = false;
      }
    },

    iconFor(type: string,): string {
      return TYPE_ICONS[type] ?? "i";
    },

    timeAgo(iso: string | undefined,): string {
      if (!iso) { return ""; }
      const then = new Date(iso,).getTime();
      if (Number.isNaN(then,)) { return ""; }
      return new Date(then,).toLocaleString();
    },
  };
};
