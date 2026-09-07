// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { parseFloatOr, } from "../../../utils/parse-number";
import { t, } from "../i18n";
import { log, } from "./shared";
import type { ModelInfo, ModelsState, ProviderInfo, } from "./types";

export const providerState: Partial<ModelsState> & ThisType<ModelsState> = {
  providers: [] as ProviderInfo[],
  providerModels: {} as Record<string, ModelInfo[]>,
  loadingModels: false,
  scanning: false,
  expandProvider: "",

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
    const size = m.paramSize ? parseFloatOr(m.paramSize, Number.NaN,) : Number.NaN;
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
        showToast("success", t("toasts.providersRescanned",),);
      } else { showToast("error", t("toasts.failedRescanProviders",),); }
    } catch {
      showToast("error", t("toasts.networkError",),);
    } finally {
      this.scanning = false;
    }
  },
};
