// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Admin LoRA discovery panel state.
// Drives the shipped LoRA discovery routes (`src/generation/lora/routes`):
//   GET  /api/v1/lora/status  — cache entry count / expiration
//   GET  /api/v1/lora/list    — cached models (backend + search filters)
//   POST /api/v1/lora/discover — admin-only backend scan (all or one backend)
//   POST /api/v1/lora/clear    — admin-only cache clear
// `discover` and `clear` are gated `admin.system` server-side; non-admins
// get 403s surfaced as an error string.
import { apiFetch, } from "./htmx";
import { t, } from "./i18n";
import { jsonBody, } from "./json";
import { log as rootLog, } from "./logger";

const log = rootLog.child({ module: "admin-lora", },);

/** Image backends that support LoRA discovery. */
export type LoraBackend = "comfyui" | "sd-server";

/** Cached LoRA model row (matches `LoRAModel` from generation/lora/types). */
export interface LoraModelView {
  name: string;
  filename: string;
  path: string;
  backend: LoraBackend;
  size?: number;
  triggerWords?: string[];
  recommendedStrength?: number;
}

/** Cache status payload from GET /api/v1/lora/status. */
export interface LoraCacheStatus {
  entries: number;
  nextExpiration: number | null;
}

/** State plugin for the admin LoRA discovery panel. */
export interface AdminLoraState {
  loraStatus: LoraCacheStatus | null;
  loraModels: LoraModelView[];
  loraCount: number;
  loraSearch: string;
  loraBackend: "" | LoraBackend;
  loraLoading: boolean;
  loraDiscovering: boolean;
  loraError: string;
  loraMessage: string;
  /** Load cache status + the filtered model list. */
  loadLora(): Promise<void>;
  /** Trigger discovery (all backends when `loraBackend` is empty). */
  discoverLora(): Promise<void>;
  /** Clear the discovery cache (all backends when `loraBackend` is empty). */
  clearLoraCache(): Promise<void>;
  /** Human-readable byte size for a model row. */
  loraSizeLabel(model: LoraModelView,): string;
}

export const adminLora: AdminLoraState = {
  loraStatus: null,
  loraModels: [],
  loraCount: 0,
  loraSearch: "",
  loraBackend: "",
  loraLoading: false,
  loraDiscovering: false,
  loraError: "",
  loraMessage: "",

  async loadLora() {
    if (this.loraLoading) { return; }
    this.loraLoading = true;
    this.loraError = "";
    try {
      const params = new URLSearchParams();
      if (this.loraBackend) { params.set("backend", this.loraBackend,); }
      const search = this.loraSearch.trim();
      if (search) { params.set("search", search,); }
      const query = params.size > 0 ? `?${params.toString()}` : "";

      const [statusRes, listRes,] = await Promise.allSettled([
        apiFetch("/api/v1/lora/status",),
        apiFetch(`/api/v1/lora/list${query}`,),
      ],);

      if (statusRes.status !== "fulfilled" || listRes.status !== "fulfilled") {
        this.loraModels = [];
        this.loraCount = 0;
        this.loraStatus = null;
        this.loraError = t("admin.lora.loadFailed",);
        log.warn("LoRA panel load failed", { status: statusRes.status, list: listRes.status, },);
        return;
      }

      const statusOk = statusRes.value.ok;
      const listOk = listRes.value.ok;
      if (!statusOk || !listOk) {
        this.loraModels = [];
        this.loraCount = 0;
        this.loraStatus = null;
        this.loraError = t("admin.lora.loadFailed",);
        log.warn("LoRA panel load failed", { status: statusRes.value.status, list: listRes.value.status, },);
        return;
      }

      this.loraStatus = await statusRes.value.json() as LoraCacheStatus;
      const list = await listRes.value.json() as { count?: number; models?: LoraModelView[] };
      this.loraModels = Array.isArray(list.models,) ? list.models : [];
      this.loraCount = typeof list.count === "number" ? list.count : this.loraModels.length;
    } catch (error) {
      log.warn("Failed to load LoRA panel", { cause: error instanceof Error ? error.message : String(error,), },);
      this.loraModels = [];
      this.loraCount = 0;
      this.loraStatus = null;
    } finally {
      this.loraLoading = false;
    }
  },

  async discoverLora() {
    if (this.loraDiscovering) { return; }
    this.loraDiscovering = true;
    this.loraError = "";
    this.loraMessage = "";
    try {
      const res = await apiFetch("/api/v1/lora/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({
          ...(this.loraBackend ? { backend: this.loraBackend, } : {}),
          forceRefresh: true,
        },),
      },);

      const body = await res.json().catch(() => ({}) as Record<string, unknown>) as {
        ok?: boolean;
        models?: LoraModelView[];
        errors?: string[];
        error?: string;
      };

      if (!res.ok) {
        this.loraError = body.error ?? t("admin.lora.discoverForbidden",);
        return;
      }

      const backendErrors = body.errors && body.errors.length > 0
        ? body.errors.join("; ",)
        : null;

      await this.loadLora();

      if (backendErrors) {
        this.loraError = backendErrors;
      } else if (body.ok) {
        this.loraMessage = t("admin.lora.discoverDone",);
      } else {
        this.loraError = t("admin.lora.discoverFailed",);
      }
    } catch (error) {
      log.warn("Failed to discover LoRAs", { cause: error instanceof Error ? error.message : String(error,), },);
      this.loraError = t("admin.lora.discoverFailed",);
    } finally {
      this.loraDiscovering = false;
    }
  },

  async clearLoraCache() {
    this.loraError = "";
    this.loraMessage = "";
    try {
      const res = await apiFetch("/api/v1/lora/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody(this.loraBackend ? { backend: this.loraBackend, } : {},),
      },);

      if (!res.ok) {
        this.loraError = t("admin.lora.clearForbidden",);
        return;
      }

      this.loraMessage = t("admin.lora.clearDone",);
      await this.loadLora();
    } catch (error) {
      log.warn("Failed to clear LoRA cache", { cause: error instanceof Error ? error.message : String(error,), },);
      this.loraError = t("admin.lora.clearFailed",);
    }
  },

  loraSizeLabel(model: LoraModelView,) {
    if (!model.size || model.size <= 0) { return "—"; }
    const gib = model.size / (1024 * 1024 * 1024);
    if (gib >= 1) { return `${gib.toFixed(2,)} GB`; }
    const mib = model.size / (1024 * 1024);
    return `${mib.toFixed(1,)} MB`;
  },
};
