import { log as rootLog } from "./logger";
import { jsonBody } from "./json";

const log = rootLog.child({ module: "admin-models" });

interface ProviderInfo {
  name: string;
  label: string;
  capabilities: {
    type: string;
    text: boolean;
    image: boolean;
    embeddings: boolean;
    streaming: boolean;
    tools: boolean;
    thinking: boolean;
  };
  status: string;
  modelCount: number;
  latencyMs?: number;
  lastChecked?: string;
  error?: string;
}

interface ModelRolesResponse {
  roles: Array<{ role: string; provider: string; model: string; source: string }>;
  overrides: Record<string, { provider: string; model: string }>;
  validRoles: string[];
}

interface PluginInfo {
  name: string;
  version: string;
  description: string;
  author: string;
  origin: string;
  enabled: boolean;
  routeCount: number;
}

export const adminModels = {
  providers: [] as ProviderInfo[],
  providerModels: {} as Record<string, string[]>,
  modelRoles: {} as Record<string, { provider: string; model: string }>,
  overrides: {} as Record<string, { provider: string; model: string }>,
  loadingModels: false,
  scanning: false,
  expandProvider: "",
  pluginList: [] as PluginInfo[],
  loadingPlugins: false,

  async loadModels() {
    this.loadingModels = true;
    try {
      const res = await fetch("/api/admin/providers", { headers: { Accept: "application/json" } });
      if (res.ok) {
        const data = await res.json();
        this.providers = data.providers || [];
        for (const p of this.providers) await this.loadProviderModels(p.name);
      }
    } catch {
      log.warn("Network error loading providers");
    } finally {
      this.loadingModels = false;
    }
  },
  async loadProviderModels(name: string) {
    try {
      const res = await fetch(`/api/admin/providers/${name}/models`, {
        headers: { Accept: "application/json" },
      });
      if (res.ok) {
        const data = await res.json();
        this.providerModels[name] = data.models || [];
      }
    } catch {
      log.warn(`Failed to load models for ${name}`);
    }
  },
  async loadModelRoles() {
    try {
      const res = await fetch("/api/admin/model-roles", { headers: { Accept: "application/json" } });
      if (res.ok) {
        const data: ModelRolesResponse = await res.json();
        this.overrides = data.overrides || {};
        for (const r of data.roles) this.modelRoles[r.role] = { provider: r.provider, model: r.model };
      }
    } catch {
      log.warn("Failed to load model roles");
    }
  },
  getModelsForRole(role: string): string[] {
    const provider = this.modelRoles[role]?.provider;
    if (!provider) return [];
    return this.providerModels[provider] || [];
  },
  getProviderModels(name: string): string[] {
    return this.providerModels[name] || [];
  },
  onRoleProviderChange(role: string, provider: string) {
    if (!Object.hasOwn(this.modelRoles, role)) this.modelRoles[role] = { provider: "", model: "" };
    this.modelRoles[role]!.provider = provider;
    this.modelRoles[role]!.model = "";
  },
  onRoleModelChange(role: string, model: string) {
    if (!Object.hasOwn(this.modelRoles, role)) this.modelRoles[role] = { provider: "", model: "" };
    this.modelRoles[role]!.model = model;
  },
  async saveModelRole(role: string) {
    const { provider, model } = this.modelRoles[role] || {};
    if (!provider || !model) return;
    try {
      const res = await apiFetch(`/api/admin/model-roles/${role}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: jsonBody({ provider, model }),
      });
      if (res.ok) {
        showToast("success", `${role} role updated`);
        await this.loadModelRoles();
      } else {
        const err = await res.json();
        showToast("error", err.error || "Failed");
      }
    } catch {
      showToast("error", "Network error");
    }
  },
  async clearModelRole(role: string) {
    try {
      const res = await apiFetch(`/api/admin/model-roles/${role}`, { method: "DELETE" });
      if (res.ok) {
        showToast("success", `${role} role cleared`);
        await this.loadModelRoles();
      } else {
        const err = await res.json();
        showToast("error", err.error || "Failed");
      }
    } catch {
      showToast("error", "Network error");
    }
  },
  async rescanProviders() {
    this.scanning = true;
    try {
      const res = await apiFetch("/api/admin/providers/rescan", { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        const providers = (data.providers ?? []) as ProviderInfo[];
        for (const p of providers) {
          const existing = this.providers.find((ep: any) => ep.name === p.name);
          if (existing) {
            existing.status = p.status;
            existing.modelCount = p.modelCount;
            existing.latencyMs = p.latencyMs;
            existing.error = p.error;
          }
          await this.loadProviderModels(p.name);
        }
        showToast("success", "Providers rescanned");
      } else showToast("error", "Failed to rescan providers");
    } catch {
      showToast("error", "Network error");
    } finally {
      this.scanning = false;
    }
  },

  async loadPlugins() {
    this.loadingPlugins = true;
    try {
      const res = await fetch("/api/plugins", { headers: { Accept: "application/json" } });
      if (res.ok) this.pluginList = await res.json();
    } catch {
      log.warn("Network error loading plugins");
    } finally {
      this.loadingPlugins = false;
    }
  },
  async togglePlugin(name: string, enable: boolean) {
    const action = enable ? "enable" : "disable";
    try {
      const res = await apiFetch(`/api/plugins/${name}/${action}`, { method: "POST" });
      if (res.ok) {
        showToast("success", `Plugin ${action}d`);
        await this.loadPlugins();
      } else {
        const err = await res.json();
        showToast("error", err.message || "Failed");
      }
    } catch {
      showToast("error", "Network error");
    }
  },
};
