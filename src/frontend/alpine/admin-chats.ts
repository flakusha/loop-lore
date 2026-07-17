import { log as rootLog } from "./logger";

const log = rootLog.child({ module: "admin-chats" });

interface ChatRow {
  id: string;
  name: string | null;
  type: string;
  is_pinned: string;
  world_id: string | null;
  created_at: string;
  updated_at: string;
}

export const adminChats = {
  adminChats: [] as ChatRow[],
  chatPage: 1,
  chatTotal: 0,
  loadingChats: false,
  confirmDeleteChat: "",

  async loadChats() {
    this.loadingChats = true;
    try {
      const res = await fetch(`/api/admin/chats?page=${this.chatPage}&pageSize=${(this as any).pageSize}`, {
        headers: { Accept: "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        this.adminChats = data.data || [];
        this.chatTotal = data.total || 0;
      }
    } catch {
      log.warn("Network error loading chats");
    } finally {
      this.loadingChats = false;
    }
  },
  get chatPages(): number {
    return Math.ceil(this.chatTotal / (this as any).pageSize) || 1;
  },
  async goChatsPage(p: number) {
    this.chatPage = p;
    await this.loadChats();
  },
  async deleteChat(chatId: string) {
    if (this.confirmDeleteChat !== chatId) return;
    try {
      const res = await apiFetch(`/api/admin/chats/${chatId}`, { method: "DELETE" });
      if (res.ok) {
        showToast("success", "Chat deleted");
        this.confirmDeleteChat = "";
        await this.loadChats();
        await (this as any).loadOverview();
      } else {
        const err = await res.json();
        showToast("error", err.error || "Failed");
      }
    } catch {
      showToast("error", "Network error");
    }
  },
};
