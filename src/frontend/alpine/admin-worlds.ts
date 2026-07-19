import { log as rootLog, } from "./logger";

const log = rootLog.child({ module: "admin-worlds", },);

interface WorldRow {
  id: string;
  name: string;
  description: string | null;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

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
      const res = await fetch(url, { headers: { Accept: "application/json", }, },);
      if (res.ok) {
        const data = await res.json();
        this.worlds = data.data || [];
        this.worldTotal = data.total || 0;
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
        showToast("success", "World deleted",);
        this.confirmDeleteWorld = "";
        await this.loadWorlds();
        await (this as any).loadOverview();
      } else {
        const err = await res.json();
        showToast("error", err.error || "Failed",);
      }
    } catch {
      showToast("error", "Network error",);
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
