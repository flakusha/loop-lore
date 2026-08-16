// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/frontend/alpine/user-notifications.ts
//
// Notification bell + preferences Alpine components.
//  - notificationsBell(): header bell, dropdown list, SSE-driven updates, toasts
//  - notificationPrefs(): Settings → Notifications panel (per-type toggles + mutes)
//
// Reuses the existing global `showToast` (declared on Window) for push toasts.

import { NotificationsEvent, NotificationsRefresh, } from "../../validation/schemas/responses";
import { t, } from "./i18n";
import { jsonBody, jsonParseOr, } from "./json";
import type { NotificationBellState, NotificationPrefsState, } from "./types";
import { parseOr, } from "./validation";

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
  mention: t("notifications.typeMention",),
  quest_update: t("notifications.typeQuestUpdate",),
  item_offer: t("notifications.typeItemOffer",),
  world_event: t("notifications.typeWorldEvent",),
  chat_invite: t("notifications.typeChatInvite",),
  character_update: t("notifications.typeCharacterUpdate",),
  gm_action: t("notifications.typeGmAction",),
  system: t("notifications.typeSystem",),
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
        const data = parseOr(NotificationsRefresh, await res.json(), { items: [], },);
        this.items = data.items;
        let unread = 0;
        for (const i of this.items) { if (!i.read) { unread += 1; } }
        this.unreadCount = unread;
      } catch {
        /* ignore */
      }
    },

    connect() {
      if (bellStream) { return; }
      bellStream = new EventSource("/api/notifications/stream",);
      bellStream.addEventListener("notifications", (ev: MessageEvent,) => {
        const data = parseOr(NotificationsEvent, jsonParseOr(ev.data, null,), {
          unreadCount: 0,
          items: [],
        },);
        if (data.items.length === 0 && !data.unreadCount) { return; }
        const known = new Set(Array.from(this.items, (i,) => i.id,),);
        for (const n of data.items) {
          if (!known.has(n.id,)) { globalThis.showToast("info", n.title,); }
        }
        this.items = data.items;
        if (data.unreadCount == null) {
          let unread = 0;
          for (const i of data.items) { if (!i.read) { unread += 1; } }
          this.unreadCount = unread;
        } else {
          this.unreadCount = data.unreadCount;
        }
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
      this.items = Array.from(this.items, (i,) => (i.id === id ? { ...i, read: 1, } : i),);
      let unread = 0;
      for (const i of this.items) { if (!i.read) { unread += 1; } }
      this.unreadCount = unread;
    },

    async markAllRead() {
      await apiFetch("/api/notifications/read-all", { method: "PATCH", },);
      this.items = Array.from(this.items, (i,) => ({ ...i, read: 1, }),);
      this.unreadCount = 0;
    },

    async dismiss(id: string,) {
      await apiFetch(`/api/notifications/${id}`, { method: "DELETE", },);
      const filteredItems: typeof this.items = [];
      for (const i of this.items) { if (i.id !== id) { filteredItems.push(i,); } }
      this.items = filteredItems;
      let unread = 0;
      for (const i of this.items) { if (!i.read) { unread += 1; } }
      this.unreadCount = unread;
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
    types: Array.from(Object.keys(TYPE_LABELS,), (key,) => ({ key, label: TYPE_LABELS[key] ?? key, }),),

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
      if (has) {
        const filtered: string[] = [];
        for (const w of this.mutedWorlds) { if (w !== worldId) { filtered.push(w,); } }
        this.mutedWorlds = filtered;
      } else {
        this.mutedWorlds = [...this.mutedWorlds, worldId,];
      }
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
