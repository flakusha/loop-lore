import { AdminChatRow, AdminPaginatedEnvelope, } from "../../validation/schemas/responses";
import { t, } from "./i18n";
import { log as rootLog, } from "./logger";
import { parseOr, } from "./validation";

const log = rootLog.child({ module: "admin-chats", },);

type ChatRow = AdminChatRow;

const EMPTY_ADMIN_CHATS = { data: [], total: 0, page: 1, pageSize: 50, };

export const adminChats = {
  adminChats: [] as ChatRow[],
  chatPage: 1,
  chatTotal: 0,
  loadingChats: false,
  confirmDeleteChat: "",
  chatSearch: "",
  chatTypeFilter: "",

  async loadChats() {
    this.loadingChats = true;
    try {
      let url = `/api/admin/chats?page=${this.chatPage}&pageSize=${(this as any).pageSize}`;
      if (this.chatSearch) { url += `&q=${encodeURIComponent(this.chatSearch,)}`; }
      if (this.chatTypeFilter) { url += `&type=${this.chatTypeFilter}`; }
      const res = await apiFetch(url, { headers: { Accept: "application/json", }, },);
      if (res.ok) {
        const data = parseOr(AdminPaginatedEnvelope(AdminChatRow,), await res.json(), EMPTY_ADMIN_CHATS,);
        this.adminChats = data.data;
        this.chatTotal = data.total;
      }
    } catch {
      log.warn("Network error loading chats",);
    } finally {
      this.loadingChats = false;
    }
  },
  get chatPages(): number {
    return Math.ceil(this.chatTotal / (this as any).pageSize,) || 1;
  },
  async goChatsPage(p: number,) {
    this.chatPage = p;
    await this.loadChats();
  },
  async deleteChat(chatId: string,) {
    if (this.confirmDeleteChat !== chatId) { return; }
    try {
      const res = await apiFetch(`/api/admin/chats/${chatId}`, { method: "DELETE", },);
      if (res.ok) {
        showToast("success", t("toasts.chatDeleted",),);
        this.confirmDeleteChat = "";
        await this.loadChats();
        await (this as any).loadOverview();
      } else {
        const err = await res.json();
        showToast("error", err.error || t("toasts.failed",),);
      }
    } catch {
      showToast("error", t("toasts.networkError",),);
    }
  },
  searchChats() {
    this.chatPage = 1;
    this.loadChats();
  },
  clearChatFilters() {
    this.chatSearch = "";
    this.chatTypeFilter = "";
    this.chatPage = 1;
    this.loadChats();
  },
};
