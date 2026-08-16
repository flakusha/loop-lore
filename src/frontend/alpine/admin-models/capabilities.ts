import { jsonStringifyOr, } from "../../../utils/safe-json";
import type { ModelCapabilityEntry, ModelsState, } from "./types";

/**
 * Model capabilities registry state — load, display, override, clear.
 */
export const capabilitiesState: Partial<ModelsState> & ThisType<ModelsState> = {
  modelCapabilities: [] as ModelCapabilityEntry[],
  loadingCapabilities: false,
  editingCapability: null as string | null,
  capabilityFilter: "",

  async loadModelCapabilities() {
    this.loadingCapabilities = true;
    try {
      const params = new URLSearchParams();
      if (this.capabilityFilter) { params.set("provider", this.capabilityFilter,); }
      const qs = params.toString();
      const suffix = qs ? `?${qs}` : "";
      const url = `/api/admin/model-capabilities${suffix}`;
      const res = await apiFetch(url, { headers: { Accept: "application/json", }, },);
      if (res.ok) {
        const data = await res.json();
        this.modelCapabilities = data.capabilities || [];
      }
    } catch {
      /* network error — keep stale data */
    } finally {
      this.loadingCapabilities = false;
    }
  },

  async saveCapabilityOverride(providerId: string, modelId: string, fields: Record<string, unknown>,) {
    try {
      const res = await apiFetch(
        `/api/admin/model-capabilities/${encodeURIComponent(providerId)}/${encodeURIComponent(modelId)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Accept: "application/json", },
          body: jsonStringifyOr(fields, "{}",),
        },
      );
      if (res.ok) {
        await this.loadModelCapabilities();
        showToast("success", "Override saved",);
      } else {
        showToast("error", "Failed to save override",);
      }
    } catch {
      showToast("error", "Network error",);
    }
  },

  async clearCapabilityOverride(providerId: string, modelId: string,) {
    try {
      const res = await apiFetch(
        `/api/admin/model-capabilities/${encodeURIComponent(providerId)}/${encodeURIComponent(modelId)}`,
        { method: "DELETE", headers: { Accept: "application/json", }, },
      );
      if (res.ok) {
        await this.loadModelCapabilities();
        showToast("success", "Override cleared",);
      } else {
        showToast("error", "Failed to clear override",);
      }
    } catch {
      showToast("error", "Network error",);
    }
  },

  formatCtxWindow(val: number | null,): string {
    if (val === null || val === undefined) { return "-"; }
    if (val >= 1_000_000) { return `${(val / 1_000_000).toFixed(1,)}M`; }
    if (val >= 1000) { return `${Math.round(val / 1000,)}K`; }
    return String(val,);
  },
};
