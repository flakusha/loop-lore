// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { t, } from "./i18n";
import { jsonBody, } from "./json";
import { log as rootLog, } from "./logger";

const log = rootLog.child({ module: "admin-health", },);

/**
 * Health panel state and methods for the admin system panel.
 * Extracted from admin-system.ts for the 250L size gate.
 */
export function healthPanelMethods() {
  return {
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
    expandHealthProvider: "",
    // ── AUX generation telemetry (GET /api/admin/telemetry/aux) ──
    auxAggregates: [] as {
      task: string;
      totalCalls: number;
      successCount: number;
      failureCount: number;
      avgLatencyMs: number;
      totalPromptTokens: number;
      totalCompletionTokens: number;
    }[],
    auxEvents: [] as {
      id: string;
      task: string;
      model: string | null;
      provider: string | null;
      latencyMs: number;
      success: boolean;
      promptTokens: number;
      completionTokens: number;
      error: string | null;
      createdAt: string;
    }[],
    auxTotal: 0,
    loadingAuxTelemetry: false,
    nsfwConfig: { allowNsfw: true, nsfwMinAge: 18, },
    loadingNsfw: false,

    async loadHealth() {
      this.loadingHealth = true;
      await this.loadAuxTelemetry();
      try {
        const res = await apiFetch("/api/v1/health", { headers: { Accept: "application/json", }, },);
        if (res.ok) {
          const data = await res.json();
          this.healthStatus = data.status || "unknown";
          this.healthUptime = data.uptime || 0;
          this.healthTimestamp = data.timestamp || "";
          const providers = data.providers || [];
          // Enrich with model details per provider
          for (const p of providers) {
            try {
              const modelsRes = await apiFetch(`/api/admin/providers/${p.name}/models`, {
                headers: { Accept: "application/json", },
              },);
              if (modelsRes.ok) {
                const modelsData = await modelsRes.json();
                p.models = modelsData.models || [];
              }
            } catch {
              /* keep summary only */
            }
          }
          this.healthProviders = providers;
        }
      } catch {
        showToast("error", t("toasts.failedLoadHealth",),);
      } finally {
        this.loadingHealth = false;
      }
    },

    async refreshHealthWithRescan() {
      this.loadingHealth = true;
      try {
        // Trigger a full rescan first
        await apiFetch("/api/admin/providers/rescan", { method: "POST", },);
        // Then load fresh health data
        await this.loadHealth();
        showToast("success", "Health data refreshed",);
      } catch {
        showToast("error", t("toasts.failedLoadHealth",),);
        this.loadingHealth = false;
      }
    },

    async loadAuxTelemetry() {
      this.loadingAuxTelemetry = true;
      try {
        const res = await apiFetch("/api/admin/telemetry/aux?limit=50", {
          headers: { Accept: "application/json", },
        },);
        if (res.ok) {
          const data = await res.json();
          this.auxAggregates = data.aggregates || [];
          this.auxEvents = data.events || [];
          this.auxTotal = data.total || 0;
        }
      } catch {
        log.warn("Failed to load AUX telemetry",);
      } finally {
        this.loadingAuxTelemetry = false;
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
  };
}
