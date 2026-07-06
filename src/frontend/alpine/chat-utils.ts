import DOMPurify from "dompurify";
import { marked } from "marked";

export const chatUtils = {
  _groupedCache: null as Array<Record<string, unknown>> | null,
  _groupedKey: "",

  formatTime(iso: string) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  },

  displayName(msg: { role: string; actor_name?: string }): string {
    if (msg.role === "user") return "You";
    if (msg.role === "system") return "System";
    if (msg.role === "narration") return "Narrator";
    return msg.actor_name || "Assistant";
  },

  renderMarkdown(content: string): string {
    if (!content) return "";
    const html = marked.parse(content) as string;
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [
        "b", "i", "em", "strong", "a", "p", "br", "ul", "ol", "li",
        "h1", "h2", "h3", "h4", "h5", "h6", "code", "pre", "blockquote",
        "table", "thead", "tbody", "tr", "th", "td", "hr", "img",
        "del", "ins", "sup", "sub", "details", "summary", "div", "span",
      ],
      ALLOWED_ATTR: ["href", "src", "alt", "title", "class", "target", "rel"],
    });
  },

  get groupedMessages() {
    const msgs = (this as Record<string, unknown>).messages as Array<Record<string, unknown>>;
    if (!msgs || msgs.length === 0) return [];
    const key = `${msgs.length}:${String(msgs[msgs.length - 1]?.id ?? "")}:${String(msgs[0]?.id ?? "")}`;
    if (this._groupedKey === key && this._groupedCache) return this._groupedCache;
    const groups: Array<Record<string, unknown>> = [];
    for (let i = 0; i < msgs.length; i++) {
      const msg = { ...msgs[i] };
      if (i > 0) {
        const prev = msgs[i - 1];
        const sameRole = msg.role === prev.role;
        const timeDiff = new Date(String(msg.created_at)).getTime() - new Date(String(prev.created_at)).getTime();
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
      (this as Record<string, unknown>).$dispatch?.("show-toast", {
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
    const self = this as Record<string, unknown>;
    const activeChat = self.activeChat as string | null;
    if (!activeChat) return;
    try {
      const url = `/api/assets?entity_type=chat&entity_id=${activeChat}&pageSize=200`;
      const res = await apiFetch(url);
      if (res.ok) {
        const data = await res.json();
        self.galleryAssets = data.data || [];
      } else {
        self.galleryAssets = [];
      }
    } catch {
      (this as Record<string, unknown>).galleryAssets = [];
    }
  },

  async loadCharacterInfo() {
    const self = this as Record<string, unknown>;
    const activeChat = self.activeChat as string | null;
    if (!activeChat) return;
    self.currentCharacter = null;
    try {
      const res = await apiFetch(`/api/chats/${activeChat}`);
      if (res.ok) {
        const chat = await res.json();
        if (chat.character_id) {
          const charRes = await apiFetch(`/api/actors/${chat.character_id}`);
          if (charRes.ok) {
            self.currentCharacter = await charRes.json();
          }
        }
      }
    } catch {
      // Silent
    }
  },
};