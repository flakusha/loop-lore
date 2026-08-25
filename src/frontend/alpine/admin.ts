// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Admin Page component (admin.html) — orchestrator ──────────

import { adminAudit, } from "./admin-audit";
import { adminChats, } from "./admin-chats";
import { adminModels, } from "./admin-models";
import { adminReview, } from "./admin-review";
import { adminSystem, } from "./admin-system";
import { adminTemplates, } from "./admin-templates";
import { adminUsers, } from "./admin-users";
import { adminWorlds, } from "./admin-worlds";
import { formatDisplayDate, } from "./chat-utils/time";
import { apiFetch, } from "./htmx";

// Fallback: expose showTab on globalThis so Alpine expressions don't
// throw ReferenceError when initTree fails silently on HTMX swaps.
(globalThis as any).showTab = function(tab: string,) {
  console.warn("[admin] showTab called outside Alpine scope — initTree may have failed", { tab, },);
};

(globalThis as any).adminPage = function() {
  return {
    // ── Shared state ────────────────────────────────────
    activeTab: "overview",
    tabsLoaded: {} as Record<string, boolean>,
    pageSize: 20,

    // Overview
    stats: {
      users: 0,
      chats: 0,
      messages: 0,
      characters: 0,
      assets: 0,
      worlds: 0,
      deltas: { users: 0, chats: 0, worlds: 0, assets: 0, },
    },
    recentEntries: [] as {
      id: string;
      level: number;
      message: string;
      module: string | null;
      event_type: string | null;
      entity_type: string | null;
      entity_id: string | null;
      created_at: string;
    }[],
    overviewActivityFilter: "",
    overviewActivityType: "",
    _overviewPollTimer: null as ReturnType<typeof setInterval> | null,

    // ── Tab state + methods ─────────────────────────────
    ...adminUsers,
    ...adminWorlds,
    ...adminChats,
    ...adminAudit,
    ...adminModels,
    ...adminReview,
    ...adminSystem,
    ...adminTemplates,

    // ── Lifecycle ───────────────────────────────────────
    async init() {
      await this.loadOverview();
      this._overviewPollTimer = setInterval(() => {
        this.loadOverview();
      }, 30_000,);
    },

    destroy() {
      if (!this._overviewPollTimer) { return; }
      clearInterval(this._overviewPollTimer,);
      this._overviewPollTimer = null;
    },

    showTab(tab: string,) {
      this.activeTab = tab;
      if (this.tabsLoaded[tab]) { return; }
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
          this.loadSdStatus();
          this.loadSdConfig();
          this.loadModelCapabilities();
          break;
        }
        case "review": {
          this.loadReview();
          break;
        }
        case "templates": {
          this.loadTemplates();
          break;
        }
        case "plugins": {
          this.loadPlugins();
          break;
        }
        case "system": {
          this.loadSystemConfig();
          this.loadNsfwConfig();
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

    formatDate(iso: string | null,): string {
      if (!iso) { return "-"; }
      return formatDisplayDate(iso, "date",);
    },

    displayKey(key: string,): string {
      return key.replaceAll("_", " ",).replaceAll(/\b\w/g, (c,) => c.toUpperCase(),);
    },

    // ── Overview ────────────────────────────────────────
    async loadOverview() {
      try {
        const params = new URLSearchParams({ page: "1", pageSize: "20", },);
        if (this.overviewActivityFilter) { params.set("q", this.overviewActivityFilter,); }
        if (this.overviewActivityType) { params.set("event_type", this.overviewActivityType,); }
        const [statsRes, auditRes,] = await Promise.allSettled([
          apiFetch("/api/admin/stats", { headers: { Accept: "application/json", }, },),
          apiFetch(`/api/admin/audit?${params.toString()}`, { headers: { Accept: "application/json", }, },),
        ],);
        if (statsRes.status !== "fulfilled" || auditRes.status !== "fulfilled") {
          throw new Error("admin overview load failed",);
        }
        if (statsRes.value.ok) { this.stats = await statsRes.value.json(); }
        if (auditRes.value.ok) {
          const d = await auditRes.value.json();
          this.recentEntries = (d.data || []).slice(0, 20,);
        }
      } catch {
        /* ignore */
      }
    },

    goToSection(tab: string,) {
      this.showTab(tab,);
    },
  };
};
