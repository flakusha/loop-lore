import { AdminPaginatedEnvelope, AdminWorldRow, } from "../../validation/schemas/responses";
import { t, } from "./i18n";
import { log as rootLog, } from "./logger";
import { parseOr, } from "./validation";

const log = rootLog.child({ module: "admin-worlds", },);

type WorldRow = AdminWorldRow;

const EMPTY_ADMIN_WORLDS = { data: [], total: 0, page: 1, pageSize: 50, };

export const adminWorlds = {
  worlds: [] as WorldRow[],
  worldPage: 1,
  worldTotal: 0,
  loadingWorlds: false,
  confirmDeleteWorld: "",
  worldSearch: "",

  async loadWorlds() {
    this.loadingWorlds = true;
    try {
      let url = `/api/admin/worlds?page=${this.worldPage}&pageSize=${(this as any).pageSize}`;
      if (this.worldSearch) { url += `&q=${encodeURIComponent(this.worldSearch,)}`; }
      const res = await apiFetch(url, { headers: { Accept: "application/json", }, },);
      if (res.ok) {
        const data = parseOr(AdminPaginatedEnvelope(AdminWorldRow,), await res.json(), EMPTY_ADMIN_WORLDS,);
        this.worlds = data.data;
        this.worldTotal = data.total;
      }
    } catch {
      log.warn("Network error loading worlds",);
    } finally {
      this.loadingWorlds = false;
    }
  },
  get worldPages(): number {
    return Math.ceil(this.worldTotal / (this as any).pageSize,) || 1;
  },
  async goWorldsPage(p: number,) {
    this.worldPage = p;
    await this.loadWorlds();
  },
  async deleteWorld(worldId: string,) {
    if (this.confirmDeleteWorld !== worldId) { return; }
    try {
      const res = await apiFetch(`/api/admin/worlds/${worldId}`, { method: "DELETE", },);
      if (res.ok) {
        showToast("success", t("toasts.worldDeleted",),);
        this.confirmDeleteWorld = "";
        await this.loadWorlds();
        await (this as any).loadOverview();
      } else {
        const err = await res.json();
        showToast("error", err.error || t("toasts.failed",),);
      }
    } catch {
      showToast("error", t("toasts.networkError",),);
    }
  },
  searchWorlds() {
    this.worldPage = 1;
    this.loadWorlds();
  },
  clearWorldFilters() {
    this.worldSearch = "";
    this.worldPage = 1;
    this.loadWorlds();
  },
};
