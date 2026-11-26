// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Admin llama-swap status/setup panel state.
 *
 *   GET  /api/v1/admin/llama-swap/status — configured/enabled/port/path/running
 *   PATCH /api/v1/admin/llama-swap/config — update enabled/port/path
 *
 * `running` is reported by the server; when runtime-state discovery is
 * unavailable the server returns false plus a note. We display both verbatim
 * and never infer a running state from the configuration.
 */
import { t, } from "./i18n";
import { jsonBody, jsonParseOr, } from "./json";

/** Status payload from the llama-swap endpoints. */
export interface LlamaSwapStatus {
  configured: boolean;
  autoStartEnabled: boolean;
  listenPort: number | null;
  configPath: string | null;
  running: boolean;
  note?: string;
}

/** Editable subset of the llama-swap configuration. */
export interface LlamaSwapForm {
  autoStartEnabled: boolean;
  listenPort: string;
  configPath: string;
}

/** Alpine component state for the llama-swap panel. */
export interface AdminLlamaSwapState {
  status: LlamaSwapStatus;
  form: LlamaSwapForm;
  loading: boolean;
  saving: boolean;
  error: string;
  message: string;
  /** Alpine lifecycle hook — loads the current status. */
  init(): Promise<void>;
  /** Reload status and reset the edit form. */
  loadStatus(): Promise<void>;
  /** Send the edited fields and report the server result. */
  saveConfig(): Promise<void>;
}

/**
 * Keep only the contracted fields; `note` is displayed when the server could
 * not discover the runtime state.
 * @param body - parsed response body
 * @returns {LlamaSwapStatus}
 */
function normalizeStatus(body: Partial<LlamaSwapStatus>,): LlamaSwapStatus {
  return {
    configured: body.configured === true,
    autoStartEnabled: body.autoStartEnabled === true,
    listenPort: typeof body.listenPort === "number" ? body.listenPort : null,
    configPath: typeof body.configPath === "string" ? body.configPath : null,
    running: body.running === true,
    ...(typeof body.note === "string" ? { note: body.note, } : {}),
  };
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
 * Build a fresh llama-swap panel state.
 * @returns {AdminLlamaSwapState}
 */
export function createAdminLlamaSwap(): AdminLlamaSwapState {
  return {
    status: normalizeStatus({},),
    form: { autoStartEnabled: false, listenPort: "", configPath: "", },
    loading: false,
    saving: false,
    error: "",
    message: "",

    async init() {
      await this.loadStatus();
    },

    async loadStatus() {
      if (this.loading) { return; }
      this.loading = true;
      this.error = "";
      try {
        const res = await apiFetch("/api/v1/admin/llama-swap/status", { headers: { Accept: "application/json", }, },);
        if (!res.ok) {
          this.error = await errorFromResponse(res, "admin.localModels.llamaSwap.loadFailed",);
          return;
        }

        this.status = normalizeStatus(await res.json() as Partial<LlamaSwapStatus>,);
        this.form = {
          autoStartEnabled: this.status.autoStartEnabled,
          listenPort: this.status.listenPort === null ? "" : String(this.status.listenPort,),
          configPath: this.status.configPath ?? "",
        };
      } catch (error) {
        this.error = error instanceof Error ? error.message : t("admin.localModels.llamaSwap.loadFailed",);
      } finally {
        this.loading = false;
      }
    },

    async saveConfig() {
      if (this.saving) { return; }
      this.error = "";
      this.message = "";
      const body: { autoStartEnabled: boolean; listenPort?: number; configPath?: string } = {
        autoStartEnabled: this.form.autoStartEnabled,
      };

      const portText = this.form.listenPort.trim();
      if (portText !== "") {
        const port = Number(portText,);
        if (!Number.isInteger(port,) || port < 1 || port > 65535) {
          this.error = t("admin.localModels.llamaSwap.invalidPort",);
          return;
        }

        body.listenPort = port;
      }

      const configPath = this.form.configPath.trim();
      if (configPath !== "") { body.configPath = configPath; }

      this.saving = true;
      try {
        const res = await apiFetch("/api/v1/admin/llama-swap/config", {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Accept: "application/json", },
          body: jsonBody(body,),
        },);

        if (!res.ok) {
          this.error = await errorFromResponse(res, "admin.localModels.llamaSwap.saveFailed",);
          return;
        }

        this.status = normalizeStatus(await res.json() as Partial<LlamaSwapStatus>,);
        this.form = {
          autoStartEnabled: this.status.autoStartEnabled,
          listenPort: this.status.listenPort === null ? "" : String(this.status.listenPort,),
          configPath: this.status.configPath ?? "",
        };

        this.message = t("admin.localModels.llamaSwap.saveDone",);
      } catch (error) {
        this.error = error instanceof Error ? error.message : t("admin.localModels.llamaSwap.saveFailed",);
      } finally {
        this.saving = false;
      }
    },
  };
}

(globalThis as unknown as Record<string, unknown>).adminLlamaSwap = createAdminLlamaSwap;
