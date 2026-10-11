// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * GM Panel
 *
 * Alpine.js component for the GM/Story Master panel in chat.
 * Manages shadow notes, whitenotes, turn order, and quest state.
 */

import { gmPanelEntities, } from "./gm-panel-entities";
import type { ShadowNote, Whiteneote, } from "./gm-panel-types";
import { apiFetch, } from "./htmx";
import { jsonBody, } from "./json";
import { log as rootLog, } from "./logger";

export type { EntitySuggestion, ShadowNote, Whiteneote, } from "./gm-panel-types";

const log = rootLog.child({ module: "gm-panel", },);

export interface GmPanel {
  shadowNotes: ShadowNote[];
  whitenotes: Whiteneote[];
  newShadowContent: string;
  newShadowType: ShadowNote["type"];
  newShadowTrigger: string;
  newWhiteneoteContent: string;
  newWhiteneoteType: Whiteneote["type"];
  newWhiteneotePriority: number;
  newWhiteneoteMessageId: string;
  init(): Promise<void>;
  loadShadowNotes(chatId: string,): Promise<void>;
  loadWhitenotes(chatId: string,): Promise<void>;
  addShadowNote(): Promise<void>;
  addWhiteneote(): Promise<void>;
  revealShadowNote(noteId: string,): Promise<void>;
  deleteShadowNote(noteId: string,): Promise<void>;
  deleteWhiteneote(noteId: string,): Promise<void>;
}

(globalThis as unknown as Record<string, unknown>).gmPanel = function() {
  return {
    ...gmPanelEntities,
    shadowNotes: [] as ShadowNote[],
    whitenotes: [] as Whiteneote[],
    newShadowContent: "",
    newShadowType: "foreshadowing" as ShadowNote["type"],
    newShadowTrigger: "",
    newWhiteneoteContent: "",
    newWhiteneoteType: "narrative_direction" as Whiteneote["type"],
    newWhiteneotePriority: 5,
    newWhiteneoteMessageId: "",

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
        const res = await apiFetch(`/api/v1/chats/${chatId}/shadow-notes`, {},);
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
        const res = await apiFetch(`/api/v1/chats/${chatId}/whitenotes`, {},);
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
        const res = await apiFetch(`/api/v1/chats/${chatId}/shadow-notes`, {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({
            type: this.newShadowType,
            content: this.newShadowContent.trim(),
            triggerCondition: this.newShadowTrigger.trim() || null,
          },),
        },);

        if (res.ok) {
          this.newShadowContent = "";
          this.newShadowTrigger = "";
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
        const res = await apiFetch(`/api/v1/chats/${chatId}/whitenotes`, {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({
            type: this.newWhiteneoteType,
            content: this.newWhiteneoteContent.trim(),
            priority: this.newWhiteneotePriority,
            scope: "scene",
            ...(this.newWhiteneoteMessageId.trim()
              ? { messageId: this.newWhiteneoteMessageId.trim(), }
              : {}),
          },),
        },);

        if (res.ok) {
          this.newWhiteneoteContent = "";
          this.newWhiteneoteMessageId = "";
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
        const res = await apiFetch(`/api/v1/chats/${chatId}/shadow-notes/${noteId}/reveal`, {
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
        const res = await apiFetch(`/api/v1/chats/${chatId}/shadow-notes/${noteId}`, {
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
        const res = await apiFetch(`/api/v1/chats/${chatId}/whitenotes/${noteId}`, {
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
