// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { ChatSideChannelsState, SideChannel, } from "./chat-types/side-channels-state";
import { apiFetch, } from "./htmx";
import { t, } from "./i18n";
import { jsonBody, } from "./json";
import type { ChatState, } from "./types";

/**
 * Group-chat side-channels dropdown (C1 — chat-type matrix UI remainder).
 *
 * Lists side-channels of the active group chat (children linked via
 * `parent_chat_id` with no template), creates new ones, and switches the active
 * chat. Backed by `GET/POST /api/v1/chats/:id/side`.
 *
 * Display state (open flag, list, new-name) lives on `$store.ui` because the
 * chat-header dropdown is outside the chatState x-data scope and reads
 * `$store.ui.*`; methods here run on the chatState instance to reach
 * `this.activeChat`.
 */
export const chatSideChannels: Partial<ChatSideChannelsState> & ThisType<ChatState> = {
  get isGroupChat(): boolean {
    return this.currentChat?.type === "group";
  },

  async loadSideChannels() {
    if (!this.activeChat || !this.isGroupChat) { return; }
    try {
      const res = await apiFetch(`/api/v1/chats/${this.activeChat}/side`,);
      if (!res.ok) { return; }
      const body = (await res.json()) as { sideChannels: SideChannel[] };
      if (typeof Alpine !== "undefined") {
        try {
          Alpine.store("ui",).sideChannels = body.sideChannels || [];
        } catch {
          /* store not ready */
        }
      }
    } catch {
      /* ignore — dropdown just stays empty */
    }
  },

  async createSideChannel(name: string,) {
    if (!this.activeChat || !name.trim()) { return; }
    try {
      const res = await apiFetch(`/api/v1/chats/${this.activeChat}/side`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ name: name.trim(), },),
      },);
      if (res.ok) {
        const created = (await res.json()) as { id: string };
        if (typeof Alpine !== "undefined") {
          try {
            Alpine.store("ui",).newSideChannelName = "";
          } catch {
            /* store not ready */
          }
        }
        await this.loadSideChannels();
        await this.switchSideChannel(created.id,);
        this.$dispatch?.("show-toast", { type: "success", message: t("sideChannels.created",), },);
      } else {
        this.$dispatch?.("show-toast", { type: "error", message: t("sideChannels.failedCreate",), },);
      }
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: t("sideChannels.failedCreate",), },);
    }
  },

  async switchSideChannel(chatId: string,) {
    if (typeof Alpine !== "undefined") {
      try {
        Alpine.store("ui",).showSideChannels = false;
      } catch {
        /* store not ready */
      }
    }
    // selectChat lives on the shared chat state (chatWorld) and loads the
    // full chat (messages, sections, mood, participants, turn order).
    // .call(this) preserves the Alpine instance as `this` — a bare fn() call
    // loses it, breaking selectChat's `this.chats` access.
    const fn = (this as unknown as Record<string, unknown>).selectChat as
      | ((chatId: string,) => Promise<void>)
      | undefined;
    if (typeof fn === "function") { await fn.call(this, chatId,); }
  },

  toggleSideChannels() {
    if (typeof Alpine !== "undefined") {
      try {
        Alpine.store("ui",).showSideChannels = !Alpine.store("ui",).showSideChannels;
      } catch {
        /* store not ready */
        return;
      }
      if (Alpine.store("ui",).showSideChannels) { this.loadSideChannels(); }
    }
  },
};

// Expose global helpers for the chat-header side-channels button (the header
// lives outside the chatState x-data scope). Mirrors message-search.ts.
const g = globalThis as Record<string, unknown>;
g.toggleSideChannels = function() {
  const el = document.querySelector<HTMLElement>("[x-data='chatState()']",);
  if (el && typeof Alpine !== "undefined") {
    const data = Alpine.$data(el,);
    const fn = data.toggleSideChannels as (() => void) | undefined;
    // .call(data) preserves the Alpine instance as `this` — bare fn() runs
    // with an undefined/global `this`, breaking this.loadSideChannels().
    if (typeof fn === "function") { fn.call(data,); }
  }
};
g.switchSideChannel = async function(chatId: string,) {
  const el = document.querySelector<HTMLElement>("[x-data='chatState()']",);
  if (el && typeof Alpine !== "undefined") {
    const data = Alpine.$data(el,);
    const fn = data.switchSideChannel as ((id: string,) => Promise<void>) | undefined;
    if (typeof fn === "function") { await fn.call(data, chatId,); }
  }
};
g.createSideChannel = async function() {
  const el = document.querySelector<HTMLElement>("[x-data='chatState()']",);
  if (el && typeof Alpine !== "undefined") {
    const data = Alpine.$data(el,);
    const name = (Alpine.store("ui",).newSideChannelName as string) ?? "";
    const fn = data.createSideChannel as ((n: string,) => Promise<void>) | undefined;
    if (typeof fn === "function") { await fn.call(data, name,); }
  }
};
