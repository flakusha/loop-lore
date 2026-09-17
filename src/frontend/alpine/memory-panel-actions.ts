// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Memory Panel mutation actions (review, carry, edit, remember).
 * Spread into the memory panel component — methods use `this` as ChatState.
 */
import { t, } from "./i18n";
import { jsonBody, } from "./json";
import { estimateTokens, } from "./memory-panel/transform";
import type { ChatState, MemoryEntry, } from "./types";

export const memoryPanelActions: Partial<ChatState> & ThisType<ChatState> = {
  /**
   * Commit a pending extracted memory into prompt context.
   * @param id Memory id.
   */
  approveMemory(id: string,): void {
    void this._setReviewStatus(id, "committed",);
  },

  /**
   * Discard a pending extracted memory.
   * @param id Memory id.
   */
  rejectMemory(id: string,): void {
    void this._setReviewStatus(id, "rejected",);
  },

  /**
   * PUT the review status, then refresh the visible list.
   * @param id Memory id.
   * @param status New review status.
   */
  async _setReviewStatus(id: string, status: "committed" | "rejected",) {
    if (this.memoryPanel.busy) { return; }
    const actorId = this._getCharacterActorId();
    if (!actorId) { return; }
    this.memoryPanel.busy = true;
    this.memoryPanel.error = null;
    try {
      await apiFetch(`/api/actors/${actorId}/memories/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ reviewStatus: status, },),
      },);
      await this.loadMemories();
    } catch (error) {
      this.memoryPanel.error = error instanceof Error ? error.message : String(error,);
    } finally {
      this.memoryPanel.busy = false;
    }
  },

  /**
   * Scroll the chat transcript to the message a memory was extracted from.
   * @param messageId
   */
  jumpToMemorySource(messageId: string,) {
    if (!messageId) { return; }
    const el = document.querySelector<HTMLElement>(`[data-message-id="${CSS.escape(messageId,)}"]`,);
    if (!el) { return; }
    el.scrollIntoView({ behavior: "smooth", block: "center", },);
    el.classList.add("search-match-active",);
  },

  /**
   * True when the active chat carries chat-scoped memory copies.
   * @returns whether any loaded memory is a copy for the active chat
   */
  _chatHasCopies(): boolean {
    if (!this.activeChat) { return false; }
    return this.memoryPanel.characterMemories.some((m,) => m.sourceChatId === this.activeChat);
  },

  /**
   * Whether a memory is injected into the active chat's context.
   * @param mem
   * @returns whether the memory is part of the active chat's context
   */
  _isInChat(mem: MemoryEntry,): boolean {
    if (!this.activeChat) { return true; }
    return this._chatHasCopies() ? mem.sourceChatId === this.activeChat : true;
  },

  /**
   * Toggle a memory's inclusion in the active chat without touching other
   * chats: copies are added/removed; excluding from a legacy full-carry
   * chat converts it to selective via carry-except.
   * @param mem
   */
  async toggleMemoryInChat(mem: MemoryEntry,) {
    const chatId = this.activeChat;
    const actorId = this._getCharacterActorId();
    if (!chatId || !actorId) { return; }

    try {
      if (this._isInChat(mem,) && mem.sourceChatId === chatId) {
        // Remove this chat's copy.
        await apiFetch(`/api/actors/${actorId}/memories/${mem.id}`, { method: "DELETE", },);
      } else if (this._isInChat(mem,)) {
        // Legacy full carry: exclude this memory by carrying all others.
        await apiFetch(`/api/actors/${actorId}/memories/carry-except`, {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({ chatId, excludeId: mem.id, },),
        },);
      } else {
        await apiFetch(`/api/actors/${actorId}/memories/${mem.id}/carry`, {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({ chatId, },),
        },);
      }
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: t("chats.inThisChatError",), },);
    }
    await this.loadMemories();
  },

  cancelEditMemory() {
    this.memoryPanel.editingMemoryId = null;
    this.memoryPanel.editMemoryContent = "";
  },

  async saveEditMemory() {
    const memoryId = this.memoryPanel.editingMemoryId;
    if (!memoryId) { return; }
    const content = this.memoryPanel.editMemoryContent.trim();
    if (!content) { return; }
    const actorId = this._getCharacterActorId();
    if (!actorId) { return; }

    try {
      const res = await apiFetch(`/api/actors/${actorId}/memories/${memoryId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ content, },),
      },);
      if (!res.ok) { return; }
      const mem = this.getCurrentMemoryList().find((m,) => m.id === memoryId);
      if (mem) {
        mem.content = content;
        mem.tokenCount = estimateTokens(content,);
      }
      this.cancelEditMemory();
      this._updateTokenCount();
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: "Failed to update memory", },);
    }
  },

  /**
   * "Remember this" — store a message's content as a character memory.
   * @param messageId
   * @param content
   */
  async rememberMessage(messageId: string, content: string,) {
    const trimmed = (content ?? "").trim();
    if (!trimmed) { return; }
    const actorId = this._getCharacterActorId();
    if (!actorId) {
      this.$dispatch?.("show-toast", { type: "warning", message: t("toasts.noChatOrCharacter",), },);
      return;
    }

    try {
      const res = await apiFetch(`/api/actors/${actorId}/memories`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({
          content: trimmed,
          memoryType: "episodic",
          confidence: 1,
          importance: 5,
          keywords: [],
          sourceMessageIds: [messageId,],
          scope: "character",
        },),
      },);
      if (!res.ok) {
        this.$dispatch?.("show-toast", { type: "error", message: `Remember failed (${res.status})`, },);
        return;
      }
      this.$dispatch?.("show-toast", { type: "info", message: t("chats.remembered",), },);
      await this.loadMemories();
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: "Remember failed", },);
    }
  },
};
