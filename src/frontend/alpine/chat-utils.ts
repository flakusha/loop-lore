import type { ChatState, GroupedMessage } from "./types";

const getMarked = () => globalThis.__marked;
const getDOMPurify = () => globalThis.__DOMPurify;

export const chatUtils: Partial<ChatState> & ThisType<ChatState> = {
  _groupedCache: null as GroupedMessage[] | null,
  _groupedKey: "",

  formatTime(iso: string) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  },

  formatTimeShort(iso: string) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  },

  openContextMenu(event: MouseEvent, msgId: string) {
    event.preventDefault();
    event.stopPropagation();
    this._contextMenu = {
      visible: true,
      messageId: msgId,
      x: Math.min(event.clientX, window.innerWidth - 200),
      y: Math.min(event.clientY, window.innerHeight - 300),
    };
  },

  closeContextMenu() {
    this._contextMenu = { visible: false, messageId: null, x: 0, y: 0 };
  },

  displayName(msg: { role: string; actor_name?: string }): string {
    if (msg.role === "user") return "You";
    if (msg.role === "system") return "System";
    if (msg.role === "narration") return "Narrator";
    return msg.actor_name || "Assistant";
  },

  renderMarkdown(content: string): string {
    if (!content) return "";
    const marked = getMarked();
    const DOMPurify = getDOMPurify();
    if (!marked || !DOMPurify) return content;
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
        "td",
        "th",
        "tr",
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

  get groupedMessages() {
    const msgs = this.messages;
    if (!msgs || msgs.length === 0) return [];
    const key = `${msgs.length}:${msgs[msgs.length - 1]?.id ?? ""}:${msgs[0]?.id ?? ""}`;
    if (this._groupedKey === key && this._groupedCache) return this._groupedCache;
    const groups: GroupedMessage[] = [];
    for (let i = 0; i < msgs.length; i++) {
      const msg = { ...msgs[i] } as GroupedMessage;
      if (i > 0) {
        const prev = msgs[i - 1]!;
        const sameRole = msg.role === prev.role;
        const timeDiff = new Date(msg.created_at as string).getTime() - new Date(prev.created_at).getTime();
        if (sameRole && timeDiff < 300_000) {
          msg.group = true;
          const last = groups[groups.length - 1];
          if (last) last.groupCount = ((last.groupCount as number) ?? 1) + 1;
        }
      }
      groups.push(msg);
    }
    this._groupedKey = key;
    this._groupedCache = groups;
    return groups;
  },

  getMediaStyle(asset: any, totalCount: number): Record<string, string> {
    const style: Record<string, string> = {};
    if (asset.type === "image" && asset.width && asset.height) {
      const ratio = asset.width / asset.height;
      if (totalCount === 1) {
        if (ratio > 1.78) {
          style.width = "100%";
          style.maxHeight = "400px";
        } else if (ratio < 0.56) {
          style.width = "40%";
          style.float = "right";
          style.marginLeft = "12px";
        } else {
          style.width = "50%";
          style.float = "left";
          style.marginRight = "12px";
        }
      } else {
        style.width = totalCount === 2 ? "calc(50% - 6px)" : "calc(33.33% - 8px)";
        style.aspectRatio = "1";
        style.objectFit = "cover";
      }
    }
    return style;
  },

  openMediaPreview(asset: any) {
    if (asset.type === "image") {
      window.open(asset.url, "_blank", "noopener,noreferrer");
    }
  },

  openAssetPreview(asset: { id: string; asset_type?: string; filename?: string; name?: string }) {
    if (asset.asset_type === "image") {
      window.open(`/api/assets/${asset.id}/raw`, "_blank", "noopener,noreferrer");
    } else {
      this.$dispatch?.("show-toast", {
        type: "info",
        message: `${asset.filename || asset.name} (${asset.asset_type || "unknown"})`,
      });
    }
  },

  escapeHtml(str: string) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  },

  async loadGalleryAssets() {
    const activeChat = this.activeChat;
    if (!activeChat) return;
    try {
      const url = `/api/assets?entity_type=chat&entity_id=${activeChat}&pageSize=200`;
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
    const activeChat = this.activeChat;
    if (!activeChat) return;
    this.currentCharacter = null;
    try {
      const res = await apiFetch(`/api/chats/${activeChat}`);
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
      // Silent
    }
  },
};
