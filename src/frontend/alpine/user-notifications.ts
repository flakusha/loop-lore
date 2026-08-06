// src/frontend/alpine/user-notifications.ts
//
// Notification bell + preferences Alpine components.
//  - notificationsBell(): header bell, dropdown list, SSE-driven updates, toasts
//  - notificationPrefs(): Settings → Notifications panel (per-type toggles + mutes)
//
// Reuses the existing global `showToast` (declared on Window) for push toasts.

import { jsonBody, jsonParseOr, } from "./json";
import type { NotificationBellState, NotificationListItem, NotificationPrefsState, } from "./types";

const TYPE_ICONS: Record<string, string> = {
  mention: "@",
  quest_update: "Q",
  item_offer: "$",
  world_event: "W",
  chat_invite: "→",
  character_update: "C",
  gm_action: "G",
  system: "i",
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
};

let bellStream: EventSource | null = null;

globalThis.notificationsBell = function(): NotificationBellState {
  return {
    open: false,
    unreadCount: 0,
    items: [],

    init() {
      void this.refresh();
      this.connect();
    },

    async refresh() {
      try {
        const res = await apiFetch("/api/notifications?unread=true",);
        if (!res.ok) { return; }
        const data = (await res.json()) as { items: NotificationListItem[] };
        this.items = data.items ?? [];
        this.unreadCount = this.items.filter((i,) => !i.read).length;
      } catch {
        /* ignore */
      }
    },

    connect() {
      if (bellStream) { return; }
      bellStream = new EventSource("/api/notifications/stream",);
      bellStream.addEventListener("notifications", (ev: MessageEvent,) => {
        const data = jsonParseOr<{ unreadCount: number; items: NotificationListItem[] }>(ev.data, {
          unreadCount: 0,
          items: [],
        },);
        if (data.items.length === 0 && !data.unreadCount) { return; }
        const known = new Set(this.items.map((i,) => i.id),);
        for (const n of data.items) {
          if (!known.has(n.id,)) { globalThis.showToast("info", n.title,); }
        }
        this.items = data.items;
        this.unreadCount = data.unreadCount ?? data.items.filter((i,) => !i.read).length;
      },);
    },

    toggle() {
      this.open = !this.open;
      if (this.open) { void this.refresh(); }
    },

    iconFor(type: string,): string {
      return TYPE_ICONS[type] ?? "i";
    },

    async markRead(id: string,) {
      await apiFetch(`/api/notifications/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ read: true, },),
      },);
      this.items = this.items.map((i,) => (i.id === id ? { ...i, read: 1, } : i));
      this.unreadCount = this.items.filter((i,) => !i.read).length;
    },

    async markAllRead() {
      await apiFetch("/api/notifications/read-all", { method: "PATCH", },);
      this.items = this.items.map((i,) => ({ ...i, read: 1, }));
      this.unreadCount = 0;
    },

    async dismiss(id: string,) {
      await apiFetch(`/api/notifications/${id}`, { method: "DELETE", },);
      this.items = this.items.filter((i,) => i.id !== id);
      this.unreadCount = this.items.filter((i,) => !i.read).length;
    },

    goTo(link: string | null,) {
      if (link) { globalThis.location.assign(link,); }
      this.open = false;
    },
  };
};

globalThis.notificationPrefs = function(): NotificationPrefsState {
  return {
    loaded: false,
    saving: false,
    enabled: {},
    mutedWorlds: [] as string[],
    types: Object.keys(TYPE_LABELS,).map((key,) => ({ key, label: TYPE_LABELS[key] ?? key, })),

    init() {
      void this.refresh();
    },

    async refresh() {
      try {
        const res = await apiFetch("/api/notifications/preferences",);
        if (!res.ok) { return; }
        const data = (await res.json()) as {
          enabled: Record<string, boolean>;
          mutedWorlds: string[];
        };
        this.enabled = data.enabled ?? {};
        this.mutedWorlds = data.mutedWorlds ?? [];
        this.loaded = true;
      } catch {
        /* ignore */
      }
    },

    async toggleType(key: string,) {
      this.enabled = { ...this.enabled, [key]: !this.enabled[key], };
      await this.save();
    },

    async toggleMuteWorld(worldId: string,) {
      const has = this.mutedWorlds.includes(worldId,);
      this.mutedWorlds = has ? this.mutedWorlds.filter((w,) => w !== worldId) : [...this.mutedWorlds, worldId,];
      await this.save();
    },

    async save() {
      this.saving = true;
      try {
        await apiFetch("/api/notifications/preferences", {
          method: "PATCH",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({ enabled: this.enabled, mutedWorlds: this.mutedWorlds, },),
        },);
      } catch {
        /* ignore */
      } finally {
        this.saving = false;
      }
    },
  };
};
