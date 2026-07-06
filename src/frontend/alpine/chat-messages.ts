import { jsonBody } from "./json";
import { log as rootLog } from "./logger";

const log = rootLog.child({ module: "chat" });

export const chatMessages = {
  async loadMessages() {
    const self = this as Record<string, unknown>;
    log.info("loadMessages", { chatId: self.activeChat });
    if (!self.activeChat) return;
    self.loadingMessages = true;
    self.currentPage = 1;
    self.hasMoreMessages = true;
    try {
      const res = await apiFetch(`/api/chats/${self.activeChat}/messages?page=1&pageSize=50`);
      const data = await res.json();
      self.messages = data.data || [];
      self.totalPages = data.pagination?.totalPages ?? 1;
    } catch {
      self.loadingError = "Failed to load messages";
      self.$dispatch?.("show-toast", { type: "error", message: "Failed to load messages" });
    } finally {
      self.loadingMessages = false;
    }
    self.$nextTick?.(() => {
      this.scrollToBottom();
      this.setupInfiniteScroll();
    });
  },

  async loadOlderMessages() {
    const self = this as Record<string, unknown>;
    log.info("loadOlderMessages", { chatId: self.activeChat, page: (self.currentPage as number) + 1 });
    if (self.loadingOlder || !self.hasMoreMessages || !self.activeChat) return;
    self.loadingOlder = true;
    const nextPage = (self.currentPage as number) + 1;
    const el = (self.$refs as Record<string, HTMLElement> | undefined)?.messageList;
    const prevScrollHeight = el?.scrollHeight ?? 0;
    try {
      const res = await apiFetch(`/api/chats/${self.activeChat}/messages?page=${nextPage}&pageSize=50`);
      const data = await res.json();
      const older = (data.data || []) as Array<Record<string, unknown>>;
      if (older.length === 0) {
        self.hasMoreMessages = false;
      } else {
        self.messages = [...older, ...(self.messages as Array<unknown>)];
        self.currentPage = nextPage;
        self.totalPages = data.pagination?.totalPages ?? (self.totalPages as number);
        self.hasMoreMessages = (self.currentPage as number) < (self.totalPages as number);
      }
    } catch {
      self.$dispatch?.("show-toast", { type: "error", message: "Failed to load older messages" });
    } finally {
      self.loadingOlder = false;
    }
    if (el && prevScrollHeight > 0) {
      el.scrollTop = el.scrollHeight - prevScrollHeight;
    }
  },

  setupInfiniteScroll() {
    const self = this as Record<string, unknown>;
    if (self.scrollObserver) {
      (self.scrollObserver as IntersectionObserver).disconnect();
      self.scrollObserver = null;
    }
    const sentinel = document.querySelector("#scroll-sentinel");
    if (!sentinel) return;
    self.scrollObserver = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          this.loadOlderMessages();
        }
      },
      { rootMargin: "100px 0px 0px 0px" },
    );
    (self.scrollObserver as IntersectionObserver).observe(sentinel);
  },

  scrollToBottom() {
    const el = document.querySelector("#message-list");
    if (el) {
      setTimeout(() => {
        el.scrollTop = el.scrollHeight;
      }, 50);
    }
  },

  autoResize(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  },

  async sendMessage() {
    const self = this as Record<string, unknown>;
    log.info("sendMessage", { chatId: self.activeChat });
    const input = (self.$refs as Record<string, HTMLTextAreaElement> | undefined)?.messageInput;
    const text = input?.value.trim() ?? "";
    const pendingAssets = (self.pendingAssets as Array<{ assetId: string; filename: string }>) ?? [];
    if (!text && pendingAssets.length === 0) return;
    if (!self.activeChat) {
      self.$dispatch?.("show-toast", { type: "warning", message: "No active chat" });
      return;
    }

    const msgs = self.messages as Array<Record<string, unknown>>;
    msgs.push({
      id: "temp-" + Date.now(),
      role: "user",
      content: text || "(attached media)",
      created_at: new Date().toISOString(),
    });
    input!.value = "";
    this.autoResize(input!);
    self.$nextTick?.(() => this.scrollToBottom());

    const body: Record<string, unknown> = {};
    if (text) body.content = text;
    const lastMsg = msgs.findLast((m: Record<string, unknown>) => !String(m.id).startsWith("temp-"));
    if (lastMsg) body.parentId = lastMsg.id;
    if (pendingAssets.length > 0) {
      body.attachments = pendingAssets.map((a, i) => ({
        assetId: a.assetId,
        order: i,
        label: "message-attachment",
      }));
    }

    self.isGenerating = true;
    try {
      const res = await apiFetch(`/api/chats/${self.activeChat}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: jsonBody(body),
      });
      if (res.ok) {
        self.pendingAssets = [];
        await this.loadMessages();
        await (self as any).loadChats?.();
      } else {
        self.isGenerating = false;
        const err = await res.json();
        self.$dispatch?.("show-toast", { type: "error", message: err.error || "Failed to send" });
        self.messages = msgs.filter((m: Record<string, unknown>) => !String(m.id).startsWith("temp-"));
      }
    } catch {
      self.isGenerating = false;
      self.$dispatch?.("show-toast", { type: "error", message: "Network error" });
      self.messages = msgs.filter((m: Record<string, unknown>) => !String(m.id).startsWith("temp-"));
    }
  },
};
