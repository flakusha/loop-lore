// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * GM Panel
 *
 * Alpine.js component for the GM/Story Master panel in chat.
 * Manages shadow notes, whitenotes, turn order, and quest state.
 */

import { apiFetch, } from "./htmx";
import { jsonBody, } from "./json";
import { log as rootLog, } from "./logger";

const log = rootLog.child({ module: "gm-panel", },);

/** Shadow note — hidden narrative influence. */
export interface ShadowNote {
  id: string;
  chatId: string;
  type: "foreshadowing" | "consequence" | "hidden_fact" | "player_motivation" | "world_secret" | "narrative_hook";
  content: string;
  revealed: boolean;
  createdAt: string;
}

/** Whiteneote — visible GM annotation. */
export interface Whiteneote {
  id: string;
  chatId: string;
  messageId?: string;
  type: "narrative_direction" | "character_context" | "world_state" | "tone" | "pacing" | "theme";
  content: string;
  priority: number;
  scope: "scene" | "chapter" | "session" | "world";
  expiresAt?: string;
  createdAt: string;
}

(globalThis as unknown as Record<string, unknown>).gmPanel = function() {
  return {
    shadowNotes: [] as ShadowNote[],
    whitenotes: [] as Whiteneote[],
    newShadowContent: "",
    newShadowType: "foreshadowing" as ShadowNote["type"],
    newWhiteneoteContent: "",
    newWhiteneoteType: "narrative_direction" as Whiteneote["type"],
    newWhiteneotePriority: 5,

    async init() {
      const chatId = (this as any).activeChat;
      if (!chatId) { return; }
      await Promise.allSettled([
        this.loadShadowNotes(chatId,),
        this.loadWhitenotes(chatId,),
      ],);
    },

    async loadShadowNotes(chatId: string,) {
      try {
        const res = await apiFetch(`/api/chats/${chatId}/shadow-notes`, {},);
        if (res.ok) {
          const data = await res.json() as { items?: ShadowNote[] };
          this.shadowNotes = data.items ?? [];
        }
      } catch (error) {
        log.warn("Failed to load shadow notes", { error, },);
      }
    },

    async loadWhitenotes(chatId: string,) {
      try {
        const res = await apiFetch(`/api/chats/${chatId}/whitenotes`, {},);
        if (res.ok) {
          const data = await res.json() as { items?: Whiteneote[] };
          this.whitenotes = data.items ?? [];
        }
      } catch (error) {
        log.warn("Failed to load whitenotes", { error, },);
      }
    },

    async addShadowNote() {
      if (!this.newShadowContent.trim()) { return; }
      const chatId = (this as any).activeChat;
      if (!chatId) { return; }

      try {
        const res = await apiFetch(`/api/chats/${chatId}/shadow-notes`, {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({
            type: this.newShadowType,
            content: this.newShadowContent.trim(),
          },),
        },);
        if (res.ok) {
          this.newShadowContent = "";
          await this.loadShadowNotes(chatId,);
        }
      } catch (error) {
        log.warn("Failed to add shadow note", { error, },);
      }
    },

    async addWhiteneote() {
      if (!this.newWhiteneoteContent.trim()) { return; }
      const chatId = (this as any).activeChat;
      if (!chatId) { return; }

      try {
        const res = await apiFetch(`/api/chats/${chatId}/whitenotes`, {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({
            type: this.newWhiteneoteType,
            content: this.newWhiteneoteContent.trim(),
            priority: this.newWhiteneotePriority,
            scope: "scene",
          },),
        },);
        if (res.ok) {
          this.newWhiteneoteContent = "";
          await this.loadWhitenotes(chatId,);
        }
      } catch (error) {
        log.warn("Failed to add whiteneote", { error, },);
      }
    },

    async revealShadowNote(noteId: string,) {
      const chatId = (this as any).activeChat;
      if (!chatId) { return; }

      try {
        const res = await apiFetch(`/api/chats/${chatId}/shadow-notes/${noteId}/reveal`, {
          method: "POST",
        },);
        if (res.ok) {
          await this.loadShadowNotes(chatId,);
        }
      } catch (error) {
        log.warn("Failed to reveal shadow note", { error, },);
      }
    },

    async deleteShadowNote(noteId: string,) {
      const chatId = (this as any).activeChat;
      if (!chatId) { return; }

      try {
        const res = await apiFetch(`/api/chats/${chatId}/shadow-notes/${noteId}`, {
          method: "DELETE",
        },);
        if (res.ok) {
          await this.loadShadowNotes(chatId,);
        }
      } catch (error) {
        log.warn("Failed to delete shadow note", { error, },);
      }
    },

    async deleteWhiteneote(noteId: string,) {
      const chatId = (this as any).activeChat;
      if (!chatId) { return; }

      try {
        const res = await apiFetch(`/api/chats/${chatId}/whitenotes/${noteId}`, {
          method: "DELETE",
        },);
        if (res.ok) {
          await this.loadWhitenotes(chatId,);
        }
      } catch (error) {
        log.warn("Failed to delete whiteneote", { error, },);
      }
    },
  };
};
