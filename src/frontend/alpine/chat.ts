// ── Chat page component (chat.html) ────────────────────────

import { marked } from "marked";
import DOMPurify from "dompurify";

// Configure marked for GFM (tables, strikethrough, task-lists) + line breaks
marked.use({ breaks: true, gfm: true });

interface ChatAsset {
  id: string;
  name?: string;
  filename?: string;
}

globalThis.chatState = function () {
  return {
    showChatList: false,
    showGallery: false,
    showCharacterInfo: false,
    isGenerating: false,
    generationLabel: "Character is responding...",
    generationCheckInterval: null as ReturnType<typeof setInterval> | null,
    activeAttemptId: null as string | null,
    continuingMessageId: null as string | null,
    isContinuing: false,
    chats: [] as Array<{ id: string; name?: string }>,
    activeChat: null as string | null,
    messages: [] as Array<{
      id: string;
      role: string;
      content: string;
      created_at: string;
      thinking?: string;
      actor_name?: string;
      totalVariants?: number;
      variantIndex?: number;
      attachments?: Array<{
        assetId: string;
        order: number;
        caption: string;
        label: string;
        url: string;
        thumbUrl?: string;
        filename: string;
        mimeType: string;
        type: string;
        width: number;
        height: number;
      }>;
    }>,
    loadingMessages: false,
    loadingError: null as string | null,
    hasMoreMessages: true,
    loadingOlder: false,
    currentPage: 1,
    totalPages: 1,
    scrollObserver: null as IntersectionObserver | null,
    activeChatName: "Welcome to loop-lore",
    galleryAssets: [] as ChatAsset[],
    userDisplayName: "User",
    userRole: "solo",
    currentCharacter: null as {
      id: string;
      display_name?: string;
      name?: string;
      description?: string;
    } | null,
    /** Inline edit state */
    editingMessageId: null as string | null,
    editContent: "",
    previewMediaAsset: null as any,
    /** Assets uploaded but not yet sent with a message */
    pendingAssets: [] as Array<{ assetId: string; filename: string }>,
    /** Generation detail info from status endpoint */
    generationDetail: null as {
      model?: string;
      elapsedMs?: number;
      chunksReceived?: number;
      charsReceived?: number;
      status?: string;
      attemptId?: string;
    } | null,

    /** Cleanup interval on component destroy */
    _observer: null as MutationObserver | null,

    init() {
      (this as any).$root.pageTitle = "loop-lore";
      this.loadChats();
      this.loadUserInfo();

      this.generationCheckInterval = setInterval(() => {
        if (!this.isGenerating) return;
        if (this.activeChat) {
          this.checkGenerationStatus(this.activeChat);
        }
      }, 2000);

      // Auto-cleanup interval when component is removed from DOM (htmx swap)
      this._observer = new MutationObserver(() => {
        if (!document.contains(this.$el)) {
          this.destroy();
        }
      });
      this._observer.observe(document.body, { childList: true, subtree: true });

      // Close sidebar on Escape key
      document.addEventListener("keydown", (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          if (this.showChatList) {
            this.showChatList = false;
          } else if (this.showGallery) {
            this.showGallery = false;
          } else if (this.showCharacterInfo) {
            this.showCharacterInfo = false;
          }
        }
        if (e.ctrlKey && e.key === "j") {
          const focusedMsg = document.querySelector(".message.focused");
          if (focusedMsg) {
            const msgId = (focusedMsg as HTMLElement).dataset.messageId;
            if (msgId) this.continueMessage(msgId);
          }
        }
      });
    },

    destroy() {
      if (this.generationCheckInterval) {
        clearInterval(this.generationCheckInterval);
      }
      if (this.scrollObserver) {
        this.scrollObserver.disconnect();
        this.scrollObserver = null;
      }
    },

    async loadUserInfo() {
      try {
        const res = await apiFetch("/api/auth/me");
        if (res.ok) {
          const user = await res.json();
          this.userDisplayName = user.display_name || user.username || "User";
          this.userRole = user.role || "solo";
        }
      } catch {
        // Silent: non-critical
      }
    },

    async loadChats() {
      try {
        const res = await apiFetch("/api/chats?pageSize=200");
        if (!res.ok) {
          this.$dispatch("show-toast", { type: "error", message: "Failed to load chats" });
          return;
        }
        const data = await res.json();
        this.chats = data.data || [];
      } catch {
        this.$dispatch("show-toast", { type: "error", message: "Failed to load chats" });
      }
    },

    async selectChat(chatId: string) {
      if (this.isGenerating) {
        this.$dispatch("show-toast", {
          type: "warning",
          message: "Complete current generation before switching chats",
        });
        return;
      }
      this.loadingError = null;
      this.activeChat = chatId;
      const chat = this.chats.find((c: { id: string; name?: string }) => c.id === chatId);
      this.activeChatName = chat?.name || "Chat";
      history.replaceState(null, "", `/chat/${chatId}`);
      // Reset infinite scroll state on chat switch
      this.currentPage = 1;
      this.hasMoreMessages = true;
      this.loadingOlder = false;
      await Promise.all([this.loadMessages(), this.loadGalleryAssets(), this.loadCharacterInfo()]);
    },

    async loadMessages() {
      if (!this.activeChat) return;
      this.loadingMessages = true;
      this.currentPage = 1;
      this.hasMoreMessages = true;
      try {
        const res = await apiFetch(`/api/chats/${this.activeChat}/messages?page=1&pageSize=50`);
        const data = await res.json();
        this.messages = data.data || [];
        this.totalPages = data.pagination?.totalPages ?? 1;
        this.currentPage = 1;
      } catch {
        this.loadingError = "Failed to load messages";
        this.$dispatch("show-toast", { type: "error", message: "Failed to load messages" });
      } finally {
        this.loadingMessages = false;
      }
      this.$nextTick(() => {
        this.scrollToBottom();
        this.setupInfiniteScroll();
      });
    },

    async sendMessage() {
      const input = this.$refs.messageInput as HTMLTextAreaElement | undefined;
      const text = input?.value.trim() ?? "";
      if (!text && this.pendingAssets.length === 0) return;
      if (!this.activeChat) {
        this.$dispatch("show-toast", { type: "warning", message: "No active chat" });
        return;
      }

      this.messages.push({
        id: "temp-" + Date.now(),
        role: "user",
        content: text || "(attached media)",
        created_at: new Date().toISOString(),
      });
      input!.value = "";
      this.autoResize(input!);
      this.$nextTick(() => this.scrollToBottom());

      // Build body with pending assets as attachments
      const body: Record<string, unknown> = {};
      if (text) body.content = text;
      if (this.pendingAssets.length > 0) {
        body.attachments = this.pendingAssets.map((a, i) => ({
          assetId: a.assetId,
          order: i,
          label: "message-attachment",
        }));
      }

      // Show generation indicator during round-trip
      this.isGenerating = true;
      try {
        const res = await apiFetch(`/api/chats/${this.activeChat}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          this.pendingAssets = []; // Clear queue on success
          await this.loadMessages();
          await this.loadChats();
        } else {
          const err = await res.json();
          this.$dispatch("show-toast", { type: "error", message: err.error || "Failed to send" });
          this.messages = this.messages.filter((m: { id: string }) => !m.id.startsWith("temp-"));
        }
      } catch {
        this.$dispatch("show-toast", { type: "error", message: "Network error" });
        this.messages = this.messages.filter((m: { id: string }) => !m.id.startsWith("temp-"));
      } finally {
        this.isGenerating = false;
      }
    },

    autoResize(el: HTMLTextAreaElement) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 200) + "px";
    },

    scrollToBottom() {
      const el = document.querySelector("#message-list");
      if (el) {
        setTimeout(() => {
          el.scrollTop = el.scrollHeight;
        }, 50);
      }
    },

    async loadOlderMessages() {
      if (this.loadingOlder || !this.hasMoreMessages || !this.activeChat) return;
      this.loadingOlder = true;
      const nextPage = this.currentPage + 1;
      const el = this.$refs?.messageList as HTMLElement | undefined;
      const prevScrollHeight = el?.scrollHeight ?? 0;
      try {
        const res = await apiFetch(`/api/chats/${this.activeChat}/messages?page=${nextPage}&pageSize=50`);
        const data = await res.json();
        const older = (data.data || []) as typeof this.messages;
        if (older.length === 0) {
          this.hasMoreMessages = false;
        } else {
          this.messages = [...older, ...this.messages];
          this.currentPage = nextPage;
          this.totalPages = data.pagination?.totalPages ?? this.totalPages;
          this.hasMoreMessages = this.currentPage < this.totalPages;
        }
      } catch {
        this.$dispatch("show-toast", { type: "error", message: "Failed to load older messages" });
      } finally {
        this.loadingOlder = false;
      }
      // Preserve scroll position
      if (el && prevScrollHeight > 0) {
        const newScrollHeight = el.scrollHeight;
        el.scrollTop = newScrollHeight - prevScrollHeight;
      }
    },

    setupInfiniteScroll() {
      // Cleanup old observer
      if (this.scrollObserver) {
        this.scrollObserver.disconnect();
        this.scrollObserver = null;
      }
      const sentinel = document.querySelector("#scroll-sentinel");
      if (!sentinel) return;
      this.scrollObserver = new IntersectionObserver(
        (entries) => {
          if (entries[0]?.isIntersecting) {
            this.loadOlderMessages();
          }
        },
        { rootMargin: "100px 0px 0px 0px" },
      );
      this.scrollObserver.observe(sentinel);
    },

    async loadGalleryAssets() {
      if (!this.activeChat) return;
      try {
        const url = `/api/assets?entity_type=chat&entity_id=${this.activeChat}&pageSize=200`;
        const res = await apiFetch(url);
        if (res.ok) {
          const data = await res.json();
          this.galleryAssets = data.data || [];
        } else {
          this.galleryAssets = [];
        }
      } catch {
        this.galleryAssets = [];
      }
    },

    async loadCharacterInfo() {
      if (!this.activeChat) return;
      this.currentCharacter = null;
      try {
        const res = await apiFetch(`/api/chats/${this.activeChat}`);
        if (res.ok) {
          const chat = await res.json();
          if (chat.character_id) {
            const charRes = await apiFetch(`/api/actors/${chat.character_id}`);
            if (charRes.ok) {
              this.currentCharacter = await charRes.json();
            }
          }
        }
      } catch {
        // Silent: non-critical
      }
    },

    formatTime(iso: string) {
      if (!iso) return "";
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    },

    async checkGenerationStatus(chatId: string) {
      try {
        const response = await apiFetch(`/api/generation/status/${chatId}`);
        const data = await response.json();
        if (data.isActive) {
          this.isGenerating = true;
          this.activeAttemptId = data.attemptId;
          this.generationDetail = data.generation
            ? {
                attemptId: data.generation.attemptId,
                status: data.generation.status,
                elapsedMs: data.generation.elapsedMs,
                chunksReceived: data.generation.chunksReceived,
                charsReceived: data.generation.charsReceived,
              }
            : null;
          // Update label with detail info
          const detail = this.generationDetail;
          if (detail) {
            const elapsed = detail.elapsedMs ? ` (${Math.round(detail.elapsedMs / 1000)}s)` : "";
            const chars = detail.charsReceived ? ` · ${detail.charsReceived} chars` : "";
            this.generationLabel = `Generating${elapsed}${chars}`;
          }
        } else {
          this.isGenerating = false;
          this.activeAttemptId = null;
          this.generationDetail = null;
        }
      } catch {
        // Silent: polling failures are non-critical
      }
    },

    async cancelGeneration() {
      if (!this.activeChat) {
        this.$dispatch("show-toast", { type: "warning", message: "No active chat to cancel" });
        return;
      }

      try {
        const response = await apiFetch("/api/generation/cancel", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chatId: this.activeChat,
            reason: "user_cancel",
            source: "user",
            detail: "User cancelled generation",
          }),
        });

        const data = await response.json();

        if (response.ok && data.ok) {
          this.isGenerating = false;
          this.activeAttemptId = null;
          this.$dispatch("show-toast", { type: "info", message: "Generation cancelled" });
        } else {
          this.$dispatch("show-toast", {
            type: "error",
            message: data.error ?? "Failed to cancel generation",
          });
        }
      } catch {
        this.$dispatch("show-toast", { type: "error", message: "Network error cancelling generation" });
      }
    },

    async regenerateResponse() {
      if (!this.activeChat) {
        this.$dispatch("show-toast", { type: "warning", message: "No active chat" });
        return;
      }

      try {
        const response = await apiFetch("/api/generation/regenerate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatId: this.activeChat }),
        });

        const data = await response.json();

        if (response.ok && data.ready) {
          this.$dispatch("show-toast", { type: "info", message: "Regenerating response..." });
        }
      } catch {
        this.$dispatch("show-toast", { type: "error", message: "Failed to regenerate" });
      }
    },

    /** Regenerate a specific message variant (creates new sibling) */
    async regenerateVariant(messageId: string) {
      if (!this.activeChat) return;
      this.isGenerating = true;
      try {
        const res = await apiFetch("/api/generation/regenerate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatId: this.activeChat, messageId }),
        });
        if (res.ok) {
          await this.loadMessages();
          this.$dispatch("show-toast", { type: "info", message: "New variant generated" });
        }
      } catch {
        this.$dispatch("show-toast", { type: "error", message: "Failed to regenerate variant" });
      } finally {
        this.isGenerating = false;
      }
    },

    /** Switch to a different variant (direction: -1 = prev, +1 = next) */
    async switchVariant(messageId: string, direction: number) {
      const msg = this.messages.find((m) => m.id === messageId);
      if (!msg || !msg.totalVariants || msg.totalVariants <= 1) return;
      const newIdx = ((msg.variantIndex ?? 0) + direction + msg.totalVariants) % msg.totalVariants;
      try {
        const res = await apiFetch(`/api/messages/${messageId}/variant`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ variantIndex: newIdx }),
        });
        if (res.ok) {
          await this.loadMessages();
        }
      } catch {
        this.$dispatch("show-toast", { type: "error", message: "Failed to switch variant" });
      }
    },

    async continueMessage(messageId: string) {
      if (!this.activeChat) {
        this.$dispatch("show-toast", { type: "warning", message: "No active chat" });
        return;
      }

      const msgEl = document.querySelector(`[data-message-id="${CSS.escape(messageId)}"]`);
      const actorId = (msgEl as HTMLElement | null)?.dataset.actorId ?? "unknown";

      try {
        const response = await apiFetch("/api/generation/continue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messageId, chatId: this.activeChat, actorId }),
        });

        const data = await response.json();

        if (!response.ok || !data.ok) {
          this.$dispatch("show-toast", {
            type: "error",
            message: data.error ?? "Failed to continue message",
          });
          return;
        }

        this.continuingMessageId = messageId;
        this.isContinuing = true;
        this.isGenerating = true;
        if (msgEl) msgEl.classList.add("continued");

        this.$dispatch("show-toast", { type: "info", message: "Continuing message..." });
      } catch {
        this.$dispatch("show-toast", { type: "error", message: "Network error continuing message" });
      }
    },

    async retryFromPoint(attemptId: string, step: number) {
      if (!this.activeChat) {
        this.$dispatch("show-toast", { type: "warning", message: "No active chat" });
        return;
      }

      try {
        const response = await apiFetch("/api/generation/retry", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chatId: this.activeChat, attemptId, step }),
        });

        const data = await response.json();

        if (!response.ok || !data.ok) {
          this.$dispatch("show-toast", {
            type: "error",
            message: data.error ?? "Failed to retry",
          });
          return;
        }

        this.$dispatch("show-toast", {
          type: "info",
          message:
            data.resumeFromStep > 0
              ? `Resuming from step ${data.resumeFromStep + 1} of ${data.totalSteps}...`
              : "Regenerating response...",
        });

        this.isGenerating = true;
      } catch {
        this.$dispatch("show-toast", { type: "error", message: "Network error during retry" });
      }
    },

    getChatId() {
      return this.activeChat;
    },

    async handleAttach(event: Event) {
      if (!this.activeChat) {
        this.$dispatch("show-toast", { type: "warning", message: "Select a chat first" });
        return;
      }
      const input = event.target as HTMLInputElement;
      const files = input.files;
      if (!files?.length) return;

      for (const file of files) {
        const formData = new FormData();
        formData.append("file", file);
        formData.append("alt_text", file.name);

        try {
          const res = await apiFetch("/api/assets", { method: "POST", body: formData });

          if (res.ok) {
            const asset = await res.json();
            // Queue asset for next message instead of linking to chat
            this.pendingAssets.push({ assetId: asset.id, filename: file.name });
            this.$dispatch("show-toast", { type: "success", message: `Ready to attach: ${file.name}` });
          } else {
            const err = await res.json();
            this.$dispatch("show-toast", {
              type: "error",
              message: err.error || `Failed to upload ${file.name}`,
            });
          }
        } catch {
          this.$dispatch("show-toast", { type: "error", message: `Network error uploading ${file.name}` });
        }
      }

      input.value = "";
    },

    /** Remove a pending asset from the queue */
    removePendingAsset(assetId: string) {
      this.pendingAssets = this.pendingAssets.filter((a) => a.assetId !== assetId);
    },

    /** Message grouping: consecutive messages from same role within 5 min
     *  Memoized: only recomputes when messages change */
    get groupedMessages() {
      const msgs = this.messages;
      if (msgs.length === 0) return [];
      // Cache key: msg count + last msg id
      const key = `${msgs.length}:${msgs[msgs.length - 1]?.id ?? ""}:${msgs[0]?.id ?? ""}`;
      if (this._groupedKey === key && this._groupedCache) return this._groupedCache;
      const groups: Array<(typeof msgs)[number] & { group?: boolean; groupCount?: number }> = [];
      for (let i = 0; i < msgs.length; i++) {
        const msg: (typeof msgs)[number] & { group?: boolean; groupCount?: number } = { ...msgs[i] };
        if (i > 0) {
          const prev = msgs[i - 1];
          const sameRole = msg.role === prev.role;
          const timeDiff = new Date(msg.created_at).getTime() - new Date(prev.created_at).getTime();
          if (sameRole && timeDiff < 300_000) {
            msg.group = true;
            // Bump group counters
            const last = groups[groups.length - 1];
            if (last) last.groupCount = (last.groupCount ?? 1) + 1;
          }
        }
        groups.push(msg);
      }
      this._groupedKey = key;
      this._groupedCache = groups;
      return groups;
    },
    _groupedCache: null as Array<Record<string, unknown>> | null,
    _groupedKey: "",

    /** Display name for a message based on role */
    displayName(msg: { role: string; actor_name?: string }): string {
      if (msg.role === "user") return "You";
      if (msg.role === "system") return "System";
      if (msg.role === "narration") return "Narrator";
      return msg.actor_name || "Assistant";
    },

    /** Markdown-to-HTML renderer using marked (GFM: tables, strikethrough, task-lists, breaks). DOMPurify sanitizes output. */
    renderMarkdown(content: string): string {
      if (!content) return "";
      // marked.parse returns string | Promise<string>; synchronous for string input
      const html = marked.parse(content) as string;
      return DOMPurify.sanitize(html, {
        ALLOWED_TAGS: [
          "b",
          "i",
          "em",
          "strong",
          "a",
          "p",
          "br",
          "ul",
          "ol",
          "li",
          "h1",
          "h2",
          "h3",
          "h4",
          "h5",
          "h6",
          "code",
          "pre",
          "blockquote",
          "table",
          "thead",
          "tbody",
          "tr",
          "th",
          "td",
          "hr",
          "img",
          "del",
          "ins",
          "sup",
          "sub",
          "details",
          "summary",
          "div",
          "span",
        ],
        ALLOWED_ATTR: ["href", "src", "alt", "title", "class", "target", "rel"],
      });
    },

    /** Copy message content to clipboard */
    async copyMessage(msgId: string, event: Event) {
      const msg = this.messages.find((m) => m.id === msgId);
      if (!msg) return;
      const button = event.currentTarget as HTMLElement | null;
      try {
        await navigator.clipboard.writeText(msg.content);
        this.$dispatch("show-toast", { type: "success", message: "Copied to clipboard" });
      } catch {
        this.$dispatch("show-toast", { type: "error", message: "Failed to copy" });
      }
      button?.blur();
    },

    /** Start inline edit for a message */
    startEdit(msgId: string) {
      const msg = this.messages.find((m) => m.id === msgId);
      if (!msg) return;
      this.editingMessageId = msgId;
      this.editContent = msg.content;
    },

    /** Cancel inline edit */
    cancelEdit() {
      this.editingMessageId = null;
      this.editContent = "";
    },

    /** Save inline edit via PATCH */
    async saveEdit(msgId: string) {
      if (!this.activeChat || !this.editContent.trim()) return;
      try {
        const res = await apiFetch(`/api/messages/${msgId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: this.editContent.trim() }),
        });
        if (res.ok) {
          const msg = this.messages.find((m) => m.id === msgId);
          if (msg) msg.content = this.editContent.trim();
          this.$dispatch("show-toast", { type: "success", message: "Message edited" });
        } else {
          const err = await res.json();
          this.$dispatch("show-toast", { type: "error", message: err.error || "Failed to save edit" });
        }
      } catch {
        this.$dispatch("show-toast", { type: "error", message: "Network error saving edit" });
      } finally {
        this.editingMessageId = null;
        this.editContent = "";
      }
    },

    /** Remove message via soft-delete API */
    async removeMessage(msgId: string, event: Event) {
      if (!this.activeChat) return;
      if (!confirm("Delete this message?")) return;
      const button = event.currentTarget as HTMLElement | null;
      try {
        const res = await apiFetch(`/api/messages/${msgId}`, { method: "DELETE" });
        if (res.ok) {
          this.messages = this.messages.filter((m) => m.id !== msgId);
          this.$dispatch("show-toast", { type: "success", message: "Message removed" });
        } else {
          const err = await res.json();
          this.$dispatch("show-toast", { type: "error", message: err.error || "Failed to remove" });
        }
      } catch {
        this.$dispatch("show-toast", { type: "error", message: "Network error removing message" });
      }
      button?.blur();
    },

    /** Calculate CSS style for media item based on aspect ratio and count */
    getMediaStyle(asset: any, totalCount: number): Record<string, string> {
      const style: Record<string, string> = {};

      if (asset.type === "image" && asset.width && asset.height) {
        const ratio = asset.width / asset.height;

        if (totalCount === 1) {
          // Single image — aspect-ratio-based layout
          if (ratio > 1.78) {
            // >16:9 — wide
            style.width = "100%";
            style.maxHeight = "400px";
          } else if (ratio < 0.56) {
            // >9:16 — tall portrait
            style.width = "40%";
            style.float = "right";
            style.marginLeft = "12px";
          } else {
            // Square-ish
            style.width = "50%";
            style.float = "left";
            style.marginRight = "12px";
          }
        } else {
          // Multiple images — grid layout
          style.width = totalCount === 2 ? "calc(50% - 6px)" : "calc(33.33% - 8px)";
          style.aspectRatio = "1";
          style.objectFit = "cover";
        }
      }

      return style;
    },

    /** Open media preview modal for a full-size view */
    openMediaPreview(asset: any) {
      this.$dispatch("show-toast", { type: "info", message: `Viewing: ${asset.filename || asset.caption}` });
      // For v0.1, open full image in new tab
      if (asset.type === "image") {
        window.open(asset.url, "_blank", "noopener,noreferrer");
      }
    },

    escapeHtml(str: string) {
      const div = document.createElement("div");
      div.textContent = str;
      return div.innerHTML;
    },
  };
};
