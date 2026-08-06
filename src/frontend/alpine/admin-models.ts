import { jsonBody, } from "./json";
import { log as rootLog, } from "./logger";

const log = rootLog.child({ module: "admin-models", },);

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
  roles: { role: string; provider: string; model: string; source: string }[];
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

interface ModelInfo {
  id: string;
  ownedBy?: string;
  contextWindow?: number;
  maxOutput?: number;
  thinking?: boolean;
  modalities?: string[];
  toolCalling?: boolean;
  paramSize?: string;
  raw?: Record<string, unknown>;
}

export const adminModels = {
  providers: [] as ProviderInfo[],
  providerModels: {} as Record<string, ModelInfo[]>,
  modelRoleList: [] as { role: string; provider: string; model: string }[],
  overrides: {} as Record<string, { provider: string; model: string }>,
  loadingModels: false,
  scanning: false,
  expandProvider: "",
  pluginList: [] as PluginInfo[],
  loadingPlugins: false,
  sdStatus: "unknown" as "running" | "stopped" | "unknown",
  sdPort: 9010,
  sdLatencyMs: null as number | null,
  showSdConfig: false,
  sdConfig: {
    enabled: true,
    port: 9010,
    modelPath: "",
    modelType: "checkpoint" as string,
    llmPath: "",
    preferredBackend: "sd-server" as string,
  },
  comfyuiConfig: {
    url: "http://localhost:8188",
    enabled: false,
  },

  async loadModels() {
    this.loadingModels = true;
    try {
      const res = await apiFetch("/api/admin/providers", { headers: { Accept: "application/json", }, },);
      if (res.ok) {
        const data = await res.json();
        this.providers = data.providers || [];
        for (const p of this.providers) { await this.loadProviderModels(p.name,); }
      }
    } catch {
      log.warn("Network error loading providers",);
    } finally {
      this.loadingModels = false;
    }
  },
  async loadProviderModels(name: string,) {
    try {
      const res = await apiFetch(`/api/admin/providers/${name}/models`, {
        headers: { Accept: "application/json", },
      },);
      if (res.ok) {
        const data = await res.json();
        this.providerModels[name] = data.models || [];
      }
    } catch {
      log.warn(`Failed to load models for ${name}`,);
    }
  },
  async loadModelRoles() {
    try {
      const res = await apiFetch("/api/admin/model-roles", { headers: { Accept: "application/json", }, },);
      if (res.ok) {
        const data: ModelRolesResponse = await res.json();
        this.overrides = data.overrides || {};
        // Build a stable, fully-populated list so every role has a
        // reactive target for x-model (avoids selects losing/resetting state).
        // Use the server's authoritative validRoles (no server-dep import needed).
        this.modelRoleList = (data.validRoles || []).map((role,) => {
          const found = (data.roles || []).find((r,) => r.role === role);
          return { role, provider: found?.provider ?? "", model: found?.model ?? "", };
        },);
      }
    } catch {
      log.warn("Failed to load model roles",);
    }
  },
  getModelsForRole(role: string,): ModelInfo[] {
    const entry = this.modelRoleList.find((e,) => e.role === role);
    const provider = entry?.provider;
    if (!provider) { return []; }
    return this.providerModels[provider] || [];
  },
  getProviderModels(name: string,): ModelInfo[] {
    return this.providerModels[name] || [];
  },
  getSelectedModel(role: string,): ModelInfo | undefined {
    const entry = this.modelRoleList.find((e,) => e.role === role);
    if (!entry?.provider || !entry.model) { return undefined; }
    return (this.providerModels[entry.provider] || []).find((m,) => m.id === entry.model);
  },
  modelSummary(m: ModelInfo | undefined,): string {
    if (!m) { return ""; }
    const parts: string[] = [];
    if (m.paramSize) { parts.push(m.paramSize,); }
    if (m.contextWindow) { parts.push(`${m.contextWindow} ctx`,); }
    if (m.thinking) { parts.push("thinking",); }
    if (m.toolCalling) { parts.push("tools",); }
    if (m.modalities?.length) { parts.push(m.modalities.join("/",),); }
    return parts.join(" · ",);
  },
  modelSuitability(m: ModelInfo | undefined,): string {
    if (!m) { return ""; }
    const ctx = m.contextWindow ?? 0;
    const size = m.paramSize ? parseFloat(m.paramSize,) : NaN;
    const lightweight = (!Number.isNaN(size,) && size <= 3) || (ctx > 0 && ctx < 8192);
    if (lightweight) {
      return "Lightweight — better for captioning, moderation, monitoring, censoring than roleplay";
    }
    const capable = ctx >= 32_000 || (!Number.isNaN(size,) && size >= 8);
    if (capable) {
      return "Capable — suited to long-form roleplay and storytelling";
    }
    return "";
  },
  onRoleProviderChange(role: string,) {
    const entry = this.modelRoleList.find((e,) => e.role === role);
    if (entry) { entry.model = ""; }
  },
  async saveModelRole(role: string,) {
    const entry = this.modelRoleList.find((e,) => e.role === role);
    if (!entry?.provider || !entry.model) { return; }
    const { provider, model, } = entry;
    try {
      const res = await apiFetch(`/api/admin/model-roles/${role}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ provider, model, },),
      },);
      if (res.ok) {
        showToast("success", `${role} role updated`,);
        await this.loadModelRoles();
      } else {
        const err = await res.json();
        showToast("error", err.error || "Failed",);
      }
    } catch {
      showToast("error", "Network error",);
    }
  },
  async clearModelRole(role: string,) {
    try {
      const res = await apiFetch(`/api/admin/model-roles/${role}`, { method: "DELETE", },);
      if (res.ok) {
        showToast("success", `${role} role cleared`,);
        await this.loadModelRoles();
      } else {
        const err = await res.json();
        showToast("error", err.error || "Failed",);
      }
    } catch {
      showToast("error", "Network error",);
    }
  },
  async rescanProviders() {
    this.scanning = true;
    try {
      const res = await apiFetch("/api/admin/providers/rescan", { method: "POST", },);
      if (res.ok) {
        const data = await res.json();
        const providers = (data.providers ?? []) as ProviderInfo[];
        const merged = [...this.providers,];
        for (const p of providers) {
          const idx = merged.findIndex((ep: any,) => ep.name === p.name);
          if (idx === -1) {
            merged.push(p,);
          } else {
            const existing = merged[idx];
            if (!existing) { continue; }
            merged[idx] = {
              ...existing,
              name: existing.name,
              label: existing.label,
              capabilities: existing.capabilities,
              status: p.status,
              modelCount: p.modelCount,
              latencyMs: p.latencyMs,
              error: p.error,
            };
          }
          await this.loadProviderModels(p.name,);
        }
        this.providers = merged;
        showToast("success", "Providers rescanned",);
      } else { showToast("error", "Failed to rescan providers",); }
    } catch {
      showToast("error", "Network error",);
    } finally {
      this.scanning = false;
    }
  },

  async loadSdStatus() {
    try {
      const res = await apiFetch("/api/admin/sd-status", { headers: { Accept: "application/json", }, },);
      if (res.ok) {
        const data = await res.json();
        this.sdStatus = data.status;
        this.sdPort = data.port;
        this.sdLatencyMs = data.latencyMs;
      }
    } catch {
      this.sdStatus = "unknown";
    }
  },

  async loadPlugins() {
    this.loadingPlugins = true;
    try {
      const res = await apiFetch("/api/plugins", { headers: { Accept: "application/json", }, },);
      if (res.ok) { this.pluginList = await res.json(); }
    } catch {
      log.warn("Network error loading plugins",);
    } finally {
      this.loadingPlugins = false;
    }
  },
  async togglePlugin(name: string, enable: boolean,) {
    const action = enable ? "enable" : "disable";
    try {
      const res = await apiFetch(`/api/plugins/${name}/${action}`, { method: "POST", },);
      if (res.ok) {
        showToast("success", `Plugin ${action}d`,);
        await this.loadPlugins();
      } else {
        const err = await res.json();
        showToast("error", err.message || "Failed",);
      }
    } catch {
      showToast("error", "Network error",);
    }
  },

  async loadSdConfig() {
    try {
      const res = await apiFetch("/api/admin/system-config", { headers: { Accept: "application/json", }, },);
      if (res.ok) {
        const entries = await res.json();
        for (const e of entries) {
          if (e.key === "sd_server_port") { this.sdConfig.port = parseInt(e.value, 10,) || 9010; }
          if (e.key === "sd_model_path") { this.sdConfig.modelPath = e.value; }
          if (e.key === "sd_model_type") { this.sdConfig.modelType = e.value; }
          if (e.key === "sd_llm_path") { this.sdConfig.llmPath = e.value; }
          if (e.key === "sd_enabled") { this.sdConfig.enabled = e.value === "true"; }
          if (e.key === "comfyui_url") { this.comfyuiConfig.url = e.value; }
          if (e.key === "comfyui_enabled") { this.comfyuiConfig.enabled = e.value === "true"; }
        }
      }
    } catch {
      log.warn("Failed to load SD config",);
    }
  },

  async saveSdConfig() {
    try {
      const entries = [
        { key: "sd_enabled", value: String(this.sdConfig.enabled,), },
        { key: "sd_server_port", value: String(this.sdConfig.port,), },
        { key: "sd_model_path", value: this.sdConfig.modelPath, },
        { key: "sd_model_type", value: this.sdConfig.modelType, },
        { key: "sd_llm_path", value: this.sdConfig.llmPath, },
        { key: "comfyui_enabled", value: String(this.comfyuiConfig.enabled,), },
        { key: "comfyui_url", value: this.comfyuiConfig.url, },
      ];
      for (const entry of entries) {
        await apiFetch("/api/admin/system-config", {
          method: "PATCH",
          headers: { "Content-Type": "application/json", },
          body: jsonBody(entry,),
        },);
      }
      showToast("success", "SD configuration saved",);
    } catch {
      showToast("error", "Failed to save SD config",);
    }
  },
};
