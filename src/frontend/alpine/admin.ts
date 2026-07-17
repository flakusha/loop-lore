// ── Admin Page component (admin.html) — orchestrator ──────────

import { adminAudit } from "./admin-audit";
import { adminChats } from "./admin-chats";
import { adminModels } from "./admin-models";
import { adminSystem } from "./admin-system";
import { adminUsers } from "./admin-users";
import { adminWorlds } from "./admin-worlds";

(globalThis as any).adminPage = function () {
  return {
    // ── Shared state ────────────────────────────────────
    activeTab: "overview",
    tabsLoaded: {} as Record<string, boolean>,
    pageSize: 20,

    // Overview
    stats: { users: 0, chats: 0, messages: 0, characters: 0, assets: 0, worlds: 0 },
    recentEntries: [] as Array<{
      id: string;
      level: number;
      message: string;
      module: string | null;
      event_type: string | null;
      entity_type: string | null;
      entity_id: string | null;
      created_at: string;
    }>,

    // ── Tab state + methods ─────────────────────────────
    ...adminUsers,
    ...adminWorlds,
    ...adminChats,
    ...adminAudit,
    ...adminModels,
    ...adminSystem,

    // ── Lifecycle ───────────────────────────────────────
    async init() {
      await this.loadOverview();
    },

    showTab(tab: string) {
      this.activeTab = tab;
      if (this.tabsLoaded[tab]) return;
      this.tabsLoaded[tab] = true;
      switch (tab) {
        case "overview": {
          this.loadOverview();
          break;
        }
        case "users": {
          this.loadUsers();
          break;
        }
        case "worlds": {
          this.loadWorlds();
          break;
        }
        case "chats": {
          this.loadChats();
          break;
        }
        case "audit": {
          this.loadAudit();
          break;
        }
        case "models": {
          this.loadModels();
          this.loadModelRoles();
          break;
        }
        case "plugins": {
          this.loadPlugins();
          break;
        }
        case "system": {
          this.loadSystemConfig();
          break;
        }
        case "analytics": {
          this.loadAnalytics();
          break;
        }
        case "health": {
          this.loadHealth();
          break;
        }
      }
    },

    formatDate(iso: string | null): string {
      if (!iso) return "-";
      return new Date(iso).toLocaleDateString();
    },

    displayKey(key: string): string {
      return key.replaceAll("_", " ").replaceAll(/\b\w/g, (c) => c.toUpperCase());
    },

    // ── Overview ────────────────────────────────────────
    async loadOverview() {
      try {
        const [statsRes, auditRes] = await Promise.all([
          fetch("/api/admin/stats", { headers: { Accept: "application/json" } }),
          fetch("/api/admin/audit?page=1&pageSize=10", { headers: { Accept: "application/json" } }),
        ]);
        if (statsRes.ok) this.stats = await statsRes.json();
        if (auditRes.ok) {
          const d = await auditRes.json();
          this.recentEntries = (d.data || []).slice(0, 10);
        }
      } catch {
        /* ignore */
      }
    },
  };
};
