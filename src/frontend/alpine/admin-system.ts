// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { healthPanelMethods, } from "./admin-health";
import { adminImportWizard, } from "./admin-import-wizard";
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
  requires_restart?: boolean;
  per_chat_overridable?: boolean;
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

  // ── Restart-required keys (TASK-restart-required-indicator) ──
  // Per-row `requires_restart` is authoritative; the banner keys come from the config schema.
  requiresRestartKeys: {} as Record<string, true>,
  dismissedRestartKeys: {} as Record<string, true>,
  restartBannerDismissed: false,
  requiresRestart(key: string,): boolean {
    return this.systemConfig.find((c,) => c.key === key)?.requires_restart === true;
  },
  hasPendingRestart(): boolean {
    return Object.keys(this.sysConfigDirty,).some((k,) => this.requiresRestart(k,));
  },
  dismissRestartBanner() {
    this.restartBannerDismissed = true;
    for (const k of Object.keys(this.sysConfigDirty,)) { this.dismissedRestartKeys[k] = true; }
  },
  clearRestartDismissals() {
    this.restartBannerDismissed = false;
    this.dismissedRestartKeys = {};
  },

  // ── Setup wizard slice (TASK-frontend-setup-wizard; see admin-import-wizard.ts) ──
  ...adminImportWizard.call({} as never,) as Record<string, unknown> as object,
  // Analytics state + loaders live in the `adminAnalytics` slice (admin-analytics.ts).

  // ── Health + NSFW (from admin-health.ts) ────────────────
  ...healthPanelMethods(),

  async loadSystemConfig() {
    this.loadingSystemConfig = true;
    try {
      const res = await apiFetch("/api/v1/admin/system-config", { headers: { Accept: "application/json", }, },);
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
      const res = await apiFetch("/api/v1/admin/system-config", {
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
      const res = await apiFetch(`/api/v1/admin/system-config/${key}`, { method: "DELETE", },);
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
  async exportSystemConfig(format: "yaml" | "toml",) {
    try {
      const res = await apiFetch(`/api/v1/admin/system-config/export?format=${format}`, {
        headers: { Accept: format === "toml" ? "application/toml" : "application/yaml", },
      },);
      if (!res.ok) {
        const err = await res.json();
        showToast("error", err.message || t("toasts.failed",),);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob,);
      const a = document.createElement("a",);
      a.href = url;
      const today = new Date().toISOString().slice(0, 10,);
      a.download = `system-config-${today}.${format}`;
      document.body.appendChild(a,);
      a.click();
      a.remove();
      URL.revokeObjectURL(url,);
    } catch {
      showToast("error", t("toasts.networkError",),);
    }
  },

  // ── Danger Zone ─────────────────────────────────────
  dangerConfirm: { purge: "", reset: "", factory: "", },
  dangerBusy: { purge: false, reset: false, factory: false, },

  async runDangerAction(action: "purge" | "reset" | "factory",) {
    const confirmMap = {
      purge: { string: "PURGE", url: "/api/v1/admin/audit/purge", },
      reset: { string: "RESET", url: "/api/v1/admin/settings/reset", },
      factory: { string: "DELETE ALL", url: "/api/v1/admin/factory-reset", },
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
