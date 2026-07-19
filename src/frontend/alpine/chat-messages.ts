import { browserCompressThenEncrypt, } from "../browser";
import { jsonBody, } from "./json";
import { log as rootLog, } from "./logger";
import type { ChatState, } from "./types";

const log = rootLog.child({ module: "chat", },);

export const chatMessages: Partial<ChatState> & ThisType<ChatState> = {
  async loadMessages() {
    log.info("loadMessages", { chatId: this.activeChat, },);
    if (!this.activeChat) { return; }
    this.loadingMessages = true;
    this.currentPage = 1;
    this.hasMoreMessages = true;
    try {
      const res = await apiFetch(`/api/chats/${this.activeChat}/messages?page=1&pageSize=50`,);
      const data = await res.json();
      this.messages = data.data || [];
      this.totalPages = data.pagination?.totalPages ?? 1;
    } catch {
      this.loadingError = "Failed to load messages";
      this.$dispatch?.("show-toast", { type: "error", message: "Failed to load messages", },);
    } finally {
      this.loadingMessages = false;
    }
    this.$nextTick?.(() => {
      this.scrollToBottom();
      this.setupInfiniteScroll();
      this.setupScrollDetection();
    },);
    await this.loadAllReactions();
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
      const data = await res.json();
      const older = data.data || [];
      if (older.length === 0) {
        this.hasMoreMessages = false;
      } else {
        this.messages = [...older, ...this.messages,];
        this.currentPage = nextPage;
        this.totalPages = data.pagination?.totalPages ?? this.totalPages;
        this.hasMoreMessages = this.currentPage < this.totalPages;
      }
    } catch {
      this.$dispatch?.("show-toast", { type: "error", message: "Failed to load older messages", },);
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
    el.style.height = Math.min(el.scrollHeight, 200,) + "px";
  },

  async sendMessage() {
    log.info("sendMessage", { chatId: this.activeChat, },);
    const input = this.$refs.messageInput as HTMLTextAreaElement;
    const text = input.value.trim() ?? "";
    const pendingAssets = this.pendingAssets ?? [];
    if (!text && pendingAssets.length === 0) { return; }
    if (!this.activeChat) {
      this.$dispatch?.("show-toast", { type: "warning", message: "No active chat", },);
      return;
    }

    const msgs = this.messages;
    msgs.push({
      id: "temp-" + Date.now(),
      role: "user",
      content: text || "(attached media)",
      created_at: new Date().toISOString(),
    },);
    input.value = "";
    this.autoResize(input,);
    this.$nextTick?.(() => this.scrollToBottom());

    const body: Record<string, unknown> = {};
    if (text) {
      if (this._encryptionEnabled && this._chatKey && this._keyId) {
        body.content = await browserCompressThenEncrypt(text, this._chatKey, this._keyId,);
        log.debug("Message encrypted client-side before send",);
      } else {
        body.content = text;
      }
    }
    const lastMsg = msgs.findLast((m,) => !m.id.startsWith("temp-",));
    if (lastMsg) { body.parentId = lastMsg.id; }
    if (pendingAssets.length > 0) {
      body.attachments = pendingAssets.map((a, i,) => ({
        assetId: a.assetId,
        order: i,
        label: "message-attachment",
      }));
    }

    this.isGenerating = true;
    try {
      const res = await apiFetch(`/api/chats/${this.activeChat}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody(body,),
      },);
      if (res.ok) {
        this.pendingAssets = [];
        // Connect SSE for streaming generation updates
        this.connectGenerationSSE(this.activeChat,);
        await this.loadMessages();
        await this.loadChats();
      } else {
        this.isGenerating = false;
        const err = await res.json();
        this.$dispatch?.("show-toast", { type: "error", message: err.error || "Failed to send", },);
        this.messages = msgs.filter((m,) => !m.id.startsWith("temp-",));
      }
    } catch {
      this.isGenerating = false;
      this.$dispatch?.("show-toast", { type: "error", message: "Network error", },);
      this.messages = msgs.filter((m,) => !m.id.startsWith("temp-",));
    }
  },

  async toggleReaction(msgId: string, emoji: string,) {
    if (!this.activeChat) { return; }
    try {
      const res = await apiFetch(`/api/messages/${msgId}/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ emoji, },),
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
    const ids = this.messages.map((m,) => m.id);
    await Promise.allSettled(ids.map((id,) => this.loadMessageReactions(id,)),);
  },
};
