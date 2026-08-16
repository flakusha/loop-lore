// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { MessageListResponse, } from "../../validation/schemas/responses";
import { chatSendMethods, } from "./chat-send";
import { t, } from "./i18n";
import { jsonBody, } from "./json";
import { log as rootLog, } from "./logger";
import type { ChatState, Message, } from "./types";
import { parseOr, } from "./validation";

const log = rootLog.child({ module: "chat", },);

const EMPTY_MESSAGE_PAGE = {
  data: [],
  pagination: { total: 0, page: 1, pageSize: 50, totalPages: 1, },
};

export const chatMessages: Partial<ChatState> & ThisType<ChatState> = {
  ...chatSendMethods,
  async loadMessages() {
    log.info("loadMessages", { chatId: this.activeChat, },);
    if (!this.activeChat) { return; }
    this.loadingMessages = true;
    this.currentPage = 1;
    this.hasMoreMessages = true;
    try {
      const res = await apiFetch(`/api/chats/${this.activeChat}/messages?page=1&pageSize=50`,);
      const page = parseOr(MessageListResponse, await res.json(), EMPTY_MESSAGE_PAGE,);
      // Wire rows are validated by MessageListResponse; nullable columns decode
      // to `T | null` while the display `Message` type uses optional (`T | undefined`).
      // The validation guarantees shape, so this narrows null→undefined equivalence.
      this.messages = page.data as unknown as Message[];
      this.totalPages = page.pagination.totalPages;
    } catch {
      this.loadingError = t("toasts.failedLoadMessages",);
      this.$dispatch?.("show-toast", { type: "error", message: t("toasts.failedLoadMessages",), },);
    } finally {
      this.loadingMessages = false;
    }
    this.$nextTick?.(() => {
      this.scrollToBottom();
      this.setupInfiniteScroll();
      this.setupScrollDetection();
    },);
    await this.loadAllReactions();
    // Keep the VN scene in sync with the freshly loaded messages.
    this.updateVnMode?.();
  },

  async loadOlderMessages() {
    log.info("loadOlderMessages", { chatId: this.activeChat, page: this.currentPage + 1, },);
    if (this.loadingOlder || !this.hasMoreMessages || !this.activeChat) { return; }
    this.loadingOlder = true;
    const nextPage = this.currentPage + 1;
    const el = this.$refs.messageList;
    const prevScrollHeight = el?.scrollHeight ?? 0;
    try {
      const res = await apiFetch(`/api/chats/${this.activeChat}/messages?page=${nextPage}&pageSize=50`,);
      const page = parseOr(MessageListResponse, await res.json(), EMPTY_MESSAGE_PAGE,);
      const older = page.data as unknown as Message[];
      if (older.length === 0) {
        this.hasMoreMessages = false;
      } else {
        this.messages = [...older, ...this.messages,];
        this.currentPage = nextPage;
        this.totalPages = page.pagination.totalPages;
        this.hasMoreMessages = this.currentPage < this.totalPages;
      }
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: t("toasts.failedLoadOlderMessages",), },);
    } finally {
      this.loadingOlder = false;
    }
    if (el && prevScrollHeight > 0) {
      el.scrollTop = el.scrollHeight - prevScrollHeight;
    }
  },

  setupInfiniteScroll() {
    if (this.scrollObserver) {
      this.scrollObserver?.disconnect();
      this.scrollObserver = null;
    }
    const sentinel = document.querySelector("#scroll-sentinel",);
    if (!sentinel) { return; }
    this.scrollObserver = new IntersectionObserver(
      (entries,) => {
        if (entries[0]?.isIntersecting) {
          this.loadOlderMessages();
        }
      },
      { rootMargin: "100px 0px 0px 0px", },
    );
    this.scrollObserver?.observe(sentinel,);
  },

  scrollToBottom() {
    const el = document.querySelector("#message-list",);
    if (el) {
      setTimeout(() => {
        el.scrollTop = el.scrollHeight;
      }, 50,);
    }
  },

  setupScrollDetection() {
    const el = document.querySelector("#message-list",);
    if (!el) { return; }
    this._isScrolledUp = false;
    this._scrollHandler = () => {
      const threshold = 100;
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
      this._isScrolledUp = !atBottom;
    };
    el.addEventListener("scroll", this._scrollHandler, { passive: true, },);
  },

  scrollToBottomSmooth() {
    const el = document.querySelector("#message-list",);
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth", },);
      this._isScrolledUp = false;
    }
  },

  autoResize(el: HTMLTextAreaElement,) {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200,)}px`;
  },

  async toggleReaction(msgId: string, emoji: string,) {
    if (!this.activeChat) { return; }
    try {
      const res = await apiFetch(`/api/messages/${msgId}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ emoji, },),
      },);
      if (res.ok) {
        await this.loadMessageReactions(msgId,);
      }
    } catch {
      // non-critical
    }
  },

  async loadMessageReactions(msgId: string,) {
    try {
      const res = await apiFetch(`/api/messages/${msgId}/reactions`,);
      if (res.ok) {
        const reactions = await res.json();
        const msg = this.messages.find((m,) => m.id === msgId);
        if (msg) { (msg as any).reactions = reactions; }
      }
    } catch {
      // ignore
    }
  },

  async loadAllReactions() {
    if (!this.activeChat || this.messages.length === 0) { return; }
    const ids = Array.from(this.messages, (m,) => m.id,);
    await Promise.allSettled(Array.from(ids, (id,) => this.loadMessageReactions(id,),),);
  },
};
