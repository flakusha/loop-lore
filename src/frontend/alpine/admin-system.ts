import { jsonBody } from "./json";
import { log as rootLog } from "./logger";

const log = rootLog.child({ module: "admin-system" });

interface ConfigEntry {
  key: string;
  value: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export const adminSystem = {
  systemConfig: [] as ConfigEntry[],
  sysConfigDirty: {} as Record<string, string>,
  loadingSystemConfig: false,
  confirmDeleteConfig: "",
  analyticsSummary: { total: 0, distinct_sessions: 0, distinct_users: 0 },
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

  async loadSystemConfig() {
    this.loadingSystemConfig = true;
    try {
      const res = await fetch("/api/admin/system-config", { headers: { Accept: "application/json" } });
      if (res.ok) this.systemConfig = await res.json();
    } catch {
      log.warn("Network error loading system config");
    } finally {
      this.loadingSystemConfig = false;
    }
  },
  async saveSystemConfig(key: string) {
    const value = this.sysConfigDirty[key];
    if (value === undefined) return;
    try {
      const res = await apiFetch("/api/admin/system-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: jsonBody({ key, value }),
      });
      if (res.ok) {
        showToast("success", "Config saved");
        delete this.sysConfigDirty[key];
        await this.loadSystemConfig();
      } else {
        const err = await res.json();
        showToast("error", err.message || "Failed");
      }
    } catch {
      showToast("error", "Network error");
    }
  },
  async deleteSystemConfig(key: string) {
    if (this.confirmDeleteConfig !== key) return;
    try {
      const res = await apiFetch(`/api/admin/system-config/${key}`, { method: "DELETE" });
      if (res.ok) {
        showToast("success", "Config deleted");
        this.confirmDeleteConfig = "";
        await this.loadSystemConfig();
      } else {
        const err = await res.json();
        showToast("error", err.message || "Failed");
      }
    } catch {
      showToast("error", "Network error");
    }
  },

  async loadAnalytics() {
    this.loadingAnalytics = true;
    try {
      const [summaryRes, dailyRes, errorsRes] = await Promise.all([
        fetch("/api/telemetry/analytics/summary", { headers: { Accept: "application/json" } }),
        fetch("/api/telemetry/analytics/daily?limit=30", { headers: { Accept: "application/json" } }),
        fetch("/api/telemetry/analytics/errors", { headers: { Accept: "application/json" } }),
      ]);
      if (summaryRes.ok) this.analyticsSummary = await summaryRes.json();
      if (dailyRes.ok) this.dailyStats = await dailyRes.json();
      if (errorsRes.ok) this.errorEvents = await errorsRes.json();
    } catch {
      showToast("error", "Failed to load analytics");
    } finally {
      this.loadingAnalytics = false;
    }
  },
  async purgeAnalytics() {
    if (this.purgingAnalytics) return;
    this.purgingAnalytics = true;
    try {
      const res = await apiFetch("/api/telemetry/analytics/purge?days=90", { method: "DELETE" });
      if (res.ok) {
        showToast("success", "Old telemetry events purged");
        await this.loadAnalytics();
      } else {
        const err = await res.json();
        showToast("error", err.message || "Failed");
      }
    } catch {
      showToast("error", "Network error");
    } finally {
      this.purgingAnalytics = false;
    }
  },

  async loadHealth() {
    this.loadingHealth = true;
    try {
      const res = await fetch("/api/health", { headers: { Accept: "application/json" } });
      if (res.ok) {
        const data = await res.json();
        this.healthStatus = data.status || "unknown";
        this.healthUptime = data.uptime || 0;
        this.healthTimestamp = data.timestamp || "";
        this.healthProviders = data.providers || [];
      }
    } catch {
      showToast("error", "Failed to load health status");
    } finally {
      this.loadingHealth = false;
    }
  },
};
