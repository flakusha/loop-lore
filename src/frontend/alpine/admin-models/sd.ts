// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
// size-allow: 320

import { parseIntOr, } from "../../../utils/parse-number";
import { t, } from "../i18n";
import { jsonBody, jsonParseOr, } from "../json";
import { log, } from "./shared";
import type { ModelsState, } from "./types";

/** One probed sd.cpp instance from GET /api/admin/sd-status/sdcpp. */
export interface SdCppDiscoveryEntry {
  name: string;
  baseUrl: string;
  source: "config" | "stored" | "auto-start";
  dispatching: boolean;
  reachable: boolean;
  latencyMs?: number;
  version?: string;
  state?: string;
  models?: string[];
  reason?: string;
  detail?: string;
  httpStatus?: number;
  serverError?: string;
}

/** One probed ComfyUI instance from GET /api/admin/sd-status/comfyui. */
export interface ComfyDiscoveryEntry {
  name: string;
  baseUrl: string;
  source: "config" | "stored" | "auto-start";
  dispatching: boolean;
  reachable: boolean;
  latencyMs?: number;
  version?: string;
  pythonVersion?: string;
  pytorchVersion?: string;
  reason?: string;
  detail?: string;
  httpStatus?: number;
}

/** Operator-entered sd.cpp instance (apiKey is write-only). */
export interface SdCppSetupForm {
  name: string;
  label: string;
  baseUrl: string;
  purpose: "" | "generate" | "edit" | "both";
  apiKey: string;
}

/** Operator-entered ComfyUI instance (apiKey is write-only). */
export interface ComfySetupForm {
  name: string;
  label: string;
  baseUrl: string;
  purpose: "" | "generate" | "edit" | "both";
  workflow: string;
  apiKey: string;
}

/** SD state plus the local-model discovery/setup surface. */
export interface LocalModelsState extends ModelsState {
  sdcppProviders: SdCppDiscoveryEntry[];
  sdcppProbedAt: string | null;
  sdcppLoading: boolean;
  sdcppError: string;
  sdcppForm: SdCppSetupForm;
  sdcppSaving: boolean;
  sdcppDeleteTarget: string | null;
  comfyProviders: ComfyDiscoveryEntry[];
  comfyProbedAt: string | null;
  comfyLoading: boolean;
  comfyError: string;
  comfyForm: ComfySetupForm;
  comfySaving: boolean;
  comfyDeleteTarget: string | null;
  loadSdCppDiscovery(): Promise<void>;
  loadComfyDiscovery(): Promise<void>;
  saveSdCppSetup(): Promise<void>;
  saveComfySetup(): Promise<void>;
  deleteSdCppSetup(name: string,): Promise<void>;
  deleteComfySetup(name: string,): Promise<void>;
}

/**
 * Read a server error message without swallowing the failure.
 * @param res - failed response
 * @param fallbackKey - translation key when the body has no message
 * @returns {Promise<string>}
 */
async function errorFromResponse(res: Response, fallbackKey: string,): Promise<string> {
  const parsed = jsonParseOr<{ message?: string; error?: string }>(await res.text(), {},);
  return parsed.message ?? parsed.error ?? t(fallbackKey,);
}

/**
 * Map one system-config key onto the SD/comfyui admin state.
 * @param state
 * @param key
 * @param value
 */
function applySdConfigEntry(
  state: ModelsState,
  key: string,
  value: string,
): void {
  if (key === "sd_server_port") { state.sdConfig.port = parseIntOr(value, 9010,); }
  if (key === "sd_model_type") { state.sdConfig.modelType = value; }
  if (key === "sd_llm_path") { state.sdConfig.llmPath = value; }
  if (key === "sd_enabled") { state.sdConfig.enabled = value === "true"; }
  if (key === "comfyui_url") { state.comfyuiConfig.url = value; }
  if (key === "comfyui_enabled") { state.comfyuiConfig.enabled = value === "true"; }
}

export const sdState: Partial<LocalModelsState> & ThisType<LocalModelsState> = {
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
  sdcppProviders: [],
  sdcppProbedAt: null,
  sdcppLoading: false,
  sdcppError: "",
  sdcppForm: { name: "", label: "", baseUrl: "", purpose: "", apiKey: "", },
  sdcppSaving: false,
  sdcppDeleteTarget: null,
  comfyProviders: [],
  comfyProbedAt: null,
  comfyLoading: false,
  comfyError: "",
  comfyForm: { name: "", label: "", baseUrl: "", purpose: "", workflow: "", apiKey: "", },
  comfySaving: false,
  comfyDeleteTarget: null,

  /**
   * @returns {Promise<void>}
   */
  async loadSdStatus() {
    try {
      const res = await apiFetch("/api/v1/admin/sd-status", { headers: { Accept: "application/json", }, },);
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

  /**
   * @returns {Promise<void>}
   */
  async loadSdConfig() {
    try {
      const res = await apiFetch("/api/v1/admin/system-config", { headers: { Accept: "application/json", }, },);
      if (res.ok) {
        const entries = await res.json();
        for (const e of entries) {
          applySdConfigEntry(this, e.key, e.value,);
        }
      }
    } catch {
      log.warn("Failed to load SD config",);
    }
  },

  /**
   * @returns {Promise<void>}
   */
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
        await apiFetch("/api/v1/admin/system-config", {
          method: "PATCH",
          headers: { "Content-Type": "application/json", },
          body: jsonBody(entry,),
        },);
      }

      showToast("success", t("toasts.sdConfigSaved",),);
    } catch {
      showToast("error", t("toasts.failedSaveSdConfig",),);
    }
  },

  /**
   * @returns {Promise<void>}
   */
  async loadSdCppDiscovery() {
    if (this.sdcppLoading) { return; }
    this.sdcppLoading = true;
    this.sdcppError = "";
    try {
      const res = await apiFetch("/api/admin/sd-status/sdcpp", { headers: { Accept: "application/json", }, },);
      if (!res.ok) {
        this.sdcppError = await errorFromResponse(res, "admin.localModels.sdcpp.loadFailed",);
        return;
      }

      const body = await res.json() as { probedAt?: string; providers?: SdCppDiscoveryEntry[] };
      this.sdcppProviders = Array.isArray(body.providers,) ? body.providers : [];
      this.sdcppProbedAt = body.probedAt ?? null;
    } catch (error) {
      this.sdcppError = error instanceof Error ? error.message : t("admin.localModels.sdcpp.loadFailed",);
      log.warn("Failed to discover sd.cpp instances", { cause: this.sdcppError, },);
    } finally {
      this.sdcppLoading = false;
    }
  },

  /**
   * @returns {Promise<void>}
   */
  async loadComfyDiscovery() {
    if (this.comfyLoading) { return; }
    this.comfyLoading = true;
    this.comfyError = "";
    try {
      const res = await apiFetch("/api/admin/sd-status/comfyui", { headers: { Accept: "application/json", }, },);
      if (!res.ok) {
        this.comfyError = await errorFromResponse(res, "admin.localModels.comfy.loadFailed",);
        return;
      }

      const body = await res.json() as { probedAt?: string; providers?: ComfyDiscoveryEntry[] };
      this.comfyProviders = Array.isArray(body.providers,) ? body.providers : [];
      this.comfyProbedAt = body.probedAt ?? null;
    } catch (error) {
      this.comfyError = error instanceof Error ? error.message : t("admin.localModels.comfy.loadFailed",);
      log.warn("Failed to discover ComfyUI instances", { cause: this.comfyError, },);
    } finally {
      this.comfyLoading = false;
    }
  },

  /**
   * @returns {Promise<void>}
   */
  async saveSdCppSetup() {
    if (this.sdcppSaving) { return; }
    this.sdcppSaving = true;
    this.sdcppError = "";
    const form = this.sdcppForm;
    try {
      const res = await apiFetch("/api/admin/sd-status/sdcpp/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", },
        body: jsonBody({
          name: form.name.trim(),
          baseUrl: form.baseUrl.trim(),
          ...(form.label.trim() ? { label: form.label.trim(), } : {}),
          ...(form.purpose ? { purpose: form.purpose, } : {}),
          ...(form.apiKey !== "" ? { apiKey: form.apiKey, } : {}),
        },),
      },);

      if (!res.ok) {
        this.sdcppError = await errorFromResponse(res, "admin.localModels.sdcpp.saveFailed",);
        return;
      }

      form.apiKey = "";
      showToast("success", t("admin.localModels.sdcpp.saveDone",),);
      await this.loadSdCppDiscovery();
    } catch (error) {
      this.sdcppError = error instanceof Error ? error.message : t("admin.localModels.sdcpp.saveFailed",);
      log.warn("Failed to save sd.cpp setup", { cause: this.sdcppError, },);
    } finally {
      this.sdcppSaving = false;
    }
  },

  /**
   * @returns {Promise<void>}
   */
  async saveComfySetup() {
    if (this.comfySaving) { return; }
    this.comfySaving = true;
    this.comfyError = "";
    const form = this.comfyForm;
    try {
      const res = await apiFetch("/api/admin/sd-status/comfyui/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", },
        body: jsonBody({
          name: form.name.trim(),
          baseUrl: form.baseUrl.trim(),
          ...(form.label.trim() ? { label: form.label.trim(), } : {}),
          ...(form.purpose ? { purpose: form.purpose, } : {}),
          ...(form.workflow.trim() ? { workflow: form.workflow.trim(), } : {}),
          ...(form.apiKey !== "" ? { apiKey: form.apiKey, } : {}),
        },),
      },);

      if (!res.ok) {
        this.comfyError = await errorFromResponse(res, "admin.localModels.comfy.saveFailed",);
        return;
      }

      form.apiKey = "";
      showToast("success", t("admin.localModels.comfy.saveDone",),);
      await this.loadComfyDiscovery();
    } catch (error) {
      this.comfyError = error instanceof Error ? error.message : t("admin.localModels.comfy.saveFailed",);
      log.warn("Failed to save ComfyUI setup", { cause: this.comfyError, },);
    } finally {
      this.comfySaving = false;
    }
  },

  /**
   * @param name - stored instance name
   * @returns {Promise<void>}
   */
  async deleteSdCppSetup(name: string,) {
    if (this.sdcppSaving) { return; }
    this.sdcppSaving = true;
    this.sdcppError = "";
    try {
      const res = await apiFetch(`/api/admin/sd-status/sdcpp/setup/${encodeURIComponent(name,)}`, {
        method: "DELETE",
      },);

      if (!res.ok) {
        this.sdcppError = await errorFromResponse(res, "admin.localModels.sdcpp.deleteFailed",);
        return;
      }

      this.sdcppDeleteTarget = null;
      showToast("success", t("admin.localModels.sdcpp.deleteDone",),);
      await this.loadSdCppDiscovery();
    } catch (error) {
      this.sdcppError = error instanceof Error ? error.message : t("admin.localModels.sdcpp.deleteFailed",);
    } finally {
      this.sdcppSaving = false;
    }
  },

  /**
   * @param name - stored instance name
   * @returns {Promise<void>}
   */
  async deleteComfySetup(name: string,) {
    if (this.comfySaving) { return; }
    this.comfySaving = true;
    this.comfyError = "";
    try {
      const res = await apiFetch(`/api/admin/sd-status/comfyui/setup/${encodeURIComponent(name,)}`, {
        method: "DELETE",
      },);

      if (!res.ok) {
        this.comfyError = await errorFromResponse(res, "admin.localModels.comfy.deleteFailed",);
        return;
      }

      this.comfyDeleteTarget = null;
      showToast("success", t("admin.localModels.comfy.deleteDone",),);
      await this.loadComfyDiscovery();
    } catch (error) {
      this.comfyError = error instanceof Error ? error.message : t("admin.localModels.comfy.deleteFailed",);
    } finally {
      this.comfySaving = false;
    }
  },
};
