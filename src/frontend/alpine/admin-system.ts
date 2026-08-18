// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { healthPanelMethods, } from "./admin-health";
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
  // ── System Config ───────────────────────────────────────
  systemConfig: [] as ConfigEntry[],
  sysConfigDirty: {} as Record<string, string>,
  loadingSystemConfig: false,
  confirmDeleteConfig: "",

  // ── Analytics ───────────────────────────────────────────
  analyticsSummary: { total: 0, distinct_sessions: 0, distinct_users: 0, },
  dailyStats: [] as { count: number; active_users: number; date: string }[],
  errorEvents: [] as { id: string; event_type: string; session_id: string | null; created_at: string }[],
  loadingAnalytics: false,
  purgingAnalytics: false,

  // ── Health + NSFW (from admin-health.ts) ────────────────
  ...healthPanelMethods(),

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
