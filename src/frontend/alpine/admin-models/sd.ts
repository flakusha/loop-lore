// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { t, } from "../i18n";
import { jsonBody, } from "../json";
import { log, } from "./shared";
import type { ModelsState, } from "./types";

/** Map one system-config key onto the SD/comfyui admin state. */
function applySdConfigEntry(
  state: ModelsState,
  key: string,
  value: string,
): void {
  if (key === "sd_server_port") { state.sdConfig.port = parseInt(value, 10,) || 9010; }
  if (key === "sd_model_path") { state.sdConfig.modelPath = value; }
  if (key === "sd_model_type") { state.sdConfig.modelType = value; }
  if (key === "sd_llm_path") { state.sdConfig.llmPath = value; }
  if (key === "sd_enabled") { state.sdConfig.enabled = value === "true"; }
  if (key === "comfyui_url") { state.comfyuiConfig.url = value; }
  if (key === "comfyui_enabled") { state.comfyuiConfig.enabled = value === "true"; }
}

export const sdState: Partial<ModelsState> & ThisType<ModelsState> = {
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

  async loadSdConfig() {
    try {
      const res = await apiFetch("/api/admin/system-config", { headers: { Accept: "application/json", }, },);
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
      showToast("success", t("toasts.sdConfigSaved",),);
    } catch {
      showToast("error", t("toasts.failedSaveSdConfig",),);
    }
  },
};
