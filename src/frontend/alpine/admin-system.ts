// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { t, } from "./i18n";
import { jsonBody, } from "./json";
import { log as rootLog, } from "./logger";

const log = rootLog.child({ module: "admin-system", },);

interface ConfigEntry {
  key: string;
  value: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

/** Methods provided by the merged admin page state (admin.ts). */
interface AdminPageState {
  loadOverview(): Promise<void>;
}

export const adminSystem = {
  systemConfig: [] as ConfigEntry[],
  sysConfigDirty: {} as Record<string, string>,
  loadingSystemConfig: false,
  confirmDeleteConfig: "",
  analyticsSummary: { total: 0, distinct_sessions: 0, distinct_users: 0, },
  dailyStats: [] as { count: number; active_users: number; date: string }[],
  errorEvents: [] as { id: string; event_type: string; session_id: string | null; created_at: string }[],
  loadingAnalytics: false,
  purgingAnalytics: false,
  healthStatus: "unknown",
  healthUptime: 0,
  healthTimestamp: "",
  healthProviders: [] as {
    name: string;
    status: string;
    models?: string[];
    latencyMs?: number;
    error?: string;
  }[],
  loadingHealth: false,
  healthAutoRefresh: false,
  healthRefreshInterval: null as ReturnType<typeof setInterval> | null,
  nsfwConfig: { allowNsfw: true, nsfwMinAge: 18, },
  loadingNsfw: false,

  async loadSystemConfig() {
    this.loadingSystemConfig = true;
    try {
      const res = await apiFetch("/api/admin/system-config", { headers: { Accept: "application/json", }, },);
      if (res.ok) { this.systemConfig = await res.json(); }
    } catch {
      log.warn("Network error loading system config",);
    } finally {
      this.loadingSystemConfig = false;
    }
  },
  async saveSystemConfig(key: string,) {
    const value = this.sysConfigDirty[key];
    if (value === undefined) { return; }
    try {
      const res = await apiFetch("/api/admin/system-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ key, value, },),
      },);
      if (res.ok) {
        showToast("success", t("toasts.configSaved",),);
        delete this.sysConfigDirty[key];
        await this.loadSystemConfig();
      } else {
        const err = await res.json();
        showToast("error", err.message || t("toasts.failed",),);
      }
    } catch {
      showToast("error", t("toasts.networkError",),);
    }
  },
  async deleteSystemConfig(key: string,) {
    if (this.confirmDeleteConfig !== key) { return; }
    try {
      const res = await apiFetch(`/api/admin/system-config/${key}`, { method: "DELETE", },);
      if (res.ok) {
        showToast("success", t("toasts.configDeleted",),);
        this.confirmDeleteConfig = "";
        await this.loadSystemConfig();
      } else {
        const err = await res.json();
        showToast("error", err.message || t("toasts.failed",),);
      }
    } catch {
      showToast("error", t("toasts.networkError",),);
    }
  },

  async loadAnalytics() {
    this.loadingAnalytics = true;
    try {
      const [summaryRes, dailyRes, errorsRes,] = await Promise.allSettled([
        apiFetch("/api/telemetry/analytics/summary", { headers: { Accept: "application/json", }, },),
        apiFetch("/api/telemetry/analytics/daily?limit=30", { headers: { Accept: "application/json", }, },),
        apiFetch("/api/telemetry/analytics/errors", { headers: { Accept: "application/json", }, },),
      ],);
      if (summaryRes.status !== "fulfilled" || dailyRes.status !== "fulfilled" || errorsRes.status !== "fulfilled") {
        throw new Error("analytics load failed",);
      }
      if (summaryRes.value.ok) { this.analyticsSummary = await summaryRes.value.json(); }
      if (dailyRes.value.ok) { this.dailyStats = await dailyRes.value.json(); }
      if (errorsRes.value.ok) { this.errorEvents = await errorsRes.value.json(); }
    } catch {
      showToast("error", t("toasts.failedLoadAnalytics",),);
    } finally {
      this.loadingAnalytics = false;
    }
  },
  async purgeAnalytics() {
    if (this.purgingAnalytics) { return; }
    this.purgingAnalytics = true;
    try {
      const res = await apiFetch("/api/telemetry/analytics/purge?days=90", { method: "DELETE", },);
      if (res.ok) {
        showToast("success", t("toasts.telemetryPurged",),);
        await this.loadAnalytics();
      } else {
        const err = await res.json();
        showToast("error", err.message || t("toasts.failed",),);
      }
    } catch {
      showToast("error", t("toasts.networkError",),);
    } finally {
      this.purgingAnalytics = false;
    }
  },

  async loadHealth() {
    this.loadingHealth = true;
    try {
      const res = await apiFetch("/api/v1/health", { headers: { Accept: "application/json", }, },);
      if (res.ok) {
        const data = await res.json();
        this.healthStatus = data.status || "unknown";
        this.healthUptime = data.uptime || 0;
        this.healthTimestamp = data.timestamp || "";
        this.healthProviders = data.providers || [];
      }
    } catch {
      showToast("error", t("toasts.failedLoadHealth",),);
    } finally {
      this.loadingHealth = false;
    }
  },

  toggleHealthAutoRefresh() {
    this.healthAutoRefresh = !this.healthAutoRefresh;
    if (this.healthAutoRefresh) {
      this.healthRefreshInterval = setInterval(() => {
        this.loadHealth();
      }, 10_000,); // 10 seconds
    } else if (this.healthRefreshInterval) {
      clearInterval(this.healthRefreshInterval,);
      this.healthRefreshInterval = null;
    }
  },

  async loadNsfwConfig() {
    this.loadingNsfw = true;
    try {
      const res = await apiFetch("/api/admin/nsfw", { headers: { Accept: "application/json", }, },);
      if (res.ok) {
        this.nsfwConfig = await res.json();
      }
    } catch {
      log.warn("Failed to load NSFW config",);
    } finally {
      this.loadingNsfw = false;
    }
  },

  async saveNsfwConfig() {
    try {
      const res = await apiFetch("/api/admin/nsfw", {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: jsonBody(this.nsfwConfig,),
      },);
      if (res.ok) {
        showToast("success", t("toasts.nsfwPolicySaved",),);
      } else {
        const err = await res.json();
        showToast("error", err.message || t("toasts.failed",),);
      }
    } catch {
      showToast("error", t("toasts.networkError",),);
    }
  },

  // ── Danger Zone ─────────────────────────────────────
  dangerConfirm: { purge: "", reset: "", factory: "", },
  dangerBusy: { purge: false, reset: false, factory: false, },

  async runDangerAction(action: "purge" | "reset" | "factory",) {
    const confirmMap = {
      purge: { string: "PURGE", url: "/api/admin/audit/purge", },
      reset: { string: "RESET", url: "/api/admin/settings/reset", },
      factory: { string: "DELETE ALL", url: "/api/admin/factory-reset", },
    } as const;
    const cfg = confirmMap[action];
    if (this.dangerConfirm[action] !== cfg.string) { return; }
    this.dangerBusy[action] = true;
    try {
      const res = await apiFetch(cfg.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ confirmation: cfg.string, },),
      },);
      if (res.ok) {
        showToast("success", t("toasts.dangerActionDone",),);
        this.dangerConfirm[action] = "";
        if (action === "purge") { await (this as unknown as AdminPageState).loadOverview(); }
        if (action === "reset") { this.loadSystemConfig(); }
        if (action === "factory") { globalThis.location.assign("/",); }
      } else {
        const err = await res.json();
        showToast("error", err.message || t("toasts.failed",),);
      }
    } catch {
      showToast("error", t("toasts.networkError",),);
    } finally {
      this.dangerBusy[action] = false;
    }
  },
};
