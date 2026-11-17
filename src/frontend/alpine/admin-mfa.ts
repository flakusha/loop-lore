// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Admin MFA delivery-channel configuration panel state.
 *
 *   GET  /api/v1/admin/mfa/config — sender/window/channel status
 *   PATCH /api/v1/admin/mfa/config — update senders, windows, bot token
 *
 * The bot token is write-only: it is sent on save, never stored in panel
 * state and never rendered. The response only carries tokenConfigured.
 */
import { t, } from "./i18n";
import { jsonBody, jsonParseOr, } from "./json";

/** Email channel status (no secrets). */
export interface MfaEmailConfig {
  sender: string;
  windowMs: number;
  configured: boolean;
}

/** Messenger channel status (no secrets). */
export interface MfaMessengerConfig {
  sender: string;
  windowMs: number;
  tokenConfigured: boolean;
}

/** MFA configuration status from the server. */
export interface MfaConfig {
  email: MfaEmailConfig;
  messenger: MfaMessengerConfig;
}

/** Editable fields — botToken exists only here and only until save. */
export interface MfaForm {
  email: { sender: string; windowMs: string };
  messenger: { sender: string; botToken: string; windowMs: string };
}

/** Alpine component state for the MFA panel. */
export interface AdminMfaState {
  config: MfaConfig;
  form: MfaForm;
  loading: boolean;
  saving: boolean;
  error: string;
  message: string;
  /** Alpine lifecycle hook — loads the current configuration. */
  init(): Promise<void>;
  /** Reload configuration and reset the edit form. */
  loadConfig(): Promise<void>;
  /** Save the edited channels; clears the write-only token field. */
  saveConfig(): Promise<void>;
}

/**
 * Pick only the contracted status fields — a token accidentally included in
 * a response must never enter panel state.
 * @param body - parsed response body
 * @returns {MfaConfig}
 */
function normalizeConfig(body: Partial<MfaConfig>,): MfaConfig {
  return {
    email: {
      sender: typeof body.email?.sender === "string" ? body.email.sender : "",
      windowMs: typeof body.email?.windowMs === "number" ? body.email.windowMs : 0,
      configured: body.email?.configured === true,
    },
    messenger: {
      sender: typeof body.messenger?.sender === "string" ? body.messenger.sender : "",
      windowMs: typeof body.messenger?.windowMs === "number" ? body.messenger.windowMs : 0,
      tokenConfigured: body.messenger?.tokenConfigured === true,
    },
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
 * Validate a millisecond window entered by the operator.
 * @param text - form value
 * @returns {number | null} parsed value, or null when invalid
 */
function parseWindow(text: string,): number | null {
  const value = Number(text.trim(),);
  return Number.isInteger(value,) && value > 0 ? value : null;
}

/**
 * Build a fresh MFA panel state.
 * @returns {AdminMfaState}
 */
export function createAdminMfa(): AdminMfaState {
  return {
    config: normalizeConfig({},),
    form: {
      email: { sender: "", windowMs: "", },
      messenger: { sender: "", botToken: "", windowMs: "", },
    },
    loading: false,
    saving: false,
    error: "",
    message: "",

    async init() {
      await this.loadConfig();
    },

    async loadConfig() {
      if (this.loading) { return; }
      this.loading = true;
      this.error = "";
      try {
        const res = await apiFetch("/api/v1/admin/mfa/config", { headers: { Accept: "application/json", }, },);
        if (!res.ok) {
          this.error = await errorFromResponse(res, "admin.mfa.loadFailed",);
          return;
        }

        this.config = normalizeConfig(await res.json() as Partial<MfaConfig>,);
        this.form = {
          email: {
            sender: this.config.email.sender,
            windowMs: String(this.config.email.windowMs,),
          },
          messenger: {
            sender: this.config.messenger.sender,
            botToken: "",
            windowMs: String(this.config.messenger.windowMs,),
          },
        };
      } catch (error) {
        this.error = error instanceof Error ? error.message : t("admin.mfa.loadFailed",);
      } finally {
        this.loading = false;
      }
    },

    async saveConfig() {
      if (this.saving) { return; }
      this.error = "";
      this.message = "";
      const emailWindow = parseWindow(this.form.email.windowMs,);
      const messengerWindow = parseWindow(this.form.messenger.windowMs,);
      if (emailWindow === null || messengerWindow === null) {
        this.error = t("admin.mfa.invalidWindow",);
        return;
      }

      const botToken = this.form.messenger.botToken.trim();
      const body = {
        email: { sender: this.form.email.sender.trim(), windowMs: emailWindow, },
        messenger: {
          sender: this.form.messenger.sender.trim(),
          windowMs: messengerWindow,
          ...(botToken !== "" ? { botToken, } : {}),
        },
      };

      this.saving = true;
      try {
        const res = await apiFetch("/api/v1/admin/mfa/config", {
          method: "PATCH",
          headers: { "Content-Type": "application/json", Accept: "application/json", },
          body: jsonBody(body,),
        },);

        if (!res.ok) {
          this.error = await errorFromResponse(res, "admin.mfa.saveFailed",);
          return;
        }

        this.config = normalizeConfig(await res.json() as Partial<MfaConfig>,);
        this.form.email.sender = this.config.email.sender;
        this.form.email.windowMs = String(this.config.email.windowMs,);
        this.form.messenger.sender = this.config.messenger.sender;
        this.form.messenger.windowMs = String(this.config.messenger.windowMs,);
        this.form.messenger.botToken = "";
        this.message = t("admin.mfa.saveDone",);
      } catch (error) {
        this.error = error instanceof Error ? error.message : t("admin.mfa.saveFailed",);
      } finally {
        this.saving = false;
      }
    },
  };
}

(globalThis as unknown as Record<string, unknown>).adminMfa = createAdminMfa;
