// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Character licensing panel state plugin.
// Drives `/api/v1/actors/:actorId/licensing` (GET / POST / DELETE). Pairs with
// `src/components/character/licensing-panel.html`. Domain model (types, labels,
// dropdown options) lives in `./actor-licensing-model`.
import {
  type ActorLicensingState,
  type CharacterLicensing,
  type LicenseHistoryEntry,
} from "./actor-licensing-model";
import { autoResize as autoResizeImpl, } from "./auto-resize";
import { apiFetch, } from "./htmx";
import { t, } from "./i18n";
import { jsonBody, } from "./json";
import { log as rootLog, } from "./logger";

const log = rootLog.child({ module: "actor-licensing", },);

const EMPTY_FORM: ActorLicensingState["licenseForm"] = {
  license_type: "proprietary",
  custom_license_text: "",
  attribution: "",
  allow_derivatives: true,
  allow_commercial: false,
  share_alike: false,
};

/** Human label for a license type. */
const LICENSE_LABELS: Record<string, string> = {
  cc0: "CC0 (Public Domain)",
  removed: "License removed",
  cc_by: "CC BY",
  cc_by_sa: "CC BY-SA",
  cc_by_nc: "CC BY-NC",
  cc_by_nc_sa: "CC BY-NC-SA",
  proprietary: "Proprietary",
  custom: "Custom",
};

export const actorLicensing: ActorLicensingState = {
  _licActorId: null,
  license: null,
  licenseForm: { ...EMPTY_FORM, },
  licenseLoading: false,
  licenseSaving: false,
  licenseError: "",
  licenseDirty: false,
  licenseHistory: [],

  setActorId(actorId: string,) {
    if (this._licActorId === actorId) { return; }
    this._licActorId = actorId;
    this.license = null;
    this.licenseForm = { ...EMPTY_FORM, };
    this.licenseError = "";
    this.licenseDirty = false;
    this.licenseHistory = [];
    void this.loadLicensing();
    void this.loadLicenseHistory();
  },

  async loadLicensing() {
    const actorId = this._licActorId;
    if (!actorId) { return; }
    this.licenseLoading = true;
    try {
      const res = await apiFetch(`/api/v1/actors/${actorId}/licensing`,);
      if (res.status === 404) {
        this.license = null;
        return;
      }

      if (!res.ok) {
        this.licenseError = t("status.licensingLoadFailed",);
        return;
      }

      const row = (await res.json()) as CharacterLicensing;
      this.license = row;
      this.licenseForm = {
        license_type: row.license_type,
        custom_license_text: row.custom_license_text ?? "",
        attribution: row.attribution ?? "",
        allow_derivatives: row.allow_derivatives === 1,
        allow_commercial: row.allow_commercial === 1,
        share_alike: row.share_alike === 1,
      };

      this.licenseDirty = false;
    } catch (error) {
      // feFetch throws for non-2xx; a 404 is the documented "no license yet" empty state.
      if ((error as { status?: number } | null)?.status === 404) {
        this.license = null;
        return;
      }

      log.error("Failed to load licensing", error instanceof Error ? error : undefined, {},);
      this.licenseError = t("status.licensingLoadFailed",);
    } finally {
      this.licenseLoading = false;
    }
  },

  async loadLicenseHistory() {
    const actorId = this._licActorId;
    if (!actorId) { return; }
    try {
      const res = await apiFetch(`/api/v1/actors/${actorId}/licensing/history`,);
      if (!res.ok) {
        this.licenseHistory = [];
        return;
      }

      this.licenseHistory = (await res.json()) as LicenseHistoryEntry[];
    } catch (error) {
      log.error("Failed to load license history", error instanceof Error ? error : undefined, {},);
      this.licenseHistory = [];
    }
  },

  markDirty() {
    this.licenseDirty = true;
  },

  async save() {
    const actorId = this._licActorId;
    if (!actorId || this.licenseSaving) { return; }
    this.licenseSaving = true;
    this.licenseError = "";
    try {
      const body = {
        license_type: this.licenseForm.license_type,
        custom_license_text: this.licenseForm.custom_license_text || null,
        attribution: this.licenseForm.attribution || null,
        allow_derivatives: this.licenseForm.allow_derivatives,
        allow_commercial: this.licenseForm.allow_commercial,
        share_alike: this.licenseForm.share_alike,
      };

      const res = await apiFetch(`/api/v1/actors/${actorId}/licensing`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody(body,),
      },);

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({} as Record<string, unknown>)) as {
          message?: string;
        };

        this.licenseError = errBody.message ?? t("status.licensingSaveFailed",);
        return;
      }

      this.licenseDirty = false;
      await this.loadLicensing();
      await this.loadLicenseHistory();
    } catch (error) {
      log.error("Failed to save licensing", error instanceof Error ? error : undefined, {},);
      this.licenseError = t("status.licensingSaveFailed",);
    } finally {
      this.licenseSaving = false;
    }
  },

  async remove() {
    const actorId = this._licActorId;
    if (!actorId || this.licenseSaving) { return; }
    this.licenseSaving = true;
    try {
      const res = await apiFetch(`/api/v1/actors/${actorId}/licensing`, { method: "DELETE", },);
      if (!res.ok) {
        this.licenseError = t("status.licensingDeleteFailed",);
        return;
      }

      this.license = null;
      this.licenseForm = { ...EMPTY_FORM, };
      this.licenseDirty = false;
      await this.loadLicenseHistory();
    } catch (error) {
      log.error("Failed to delete licensing", error instanceof Error ? error : undefined, {},);
      this.licenseError = t("status.licensingDeleteFailed",);
    } finally {
      this.licenseSaving = false;
    }
  },

  describeLicense(code: string,) {
    return LICENSE_LABELS[code] ?? code;
  },

  autoResize(el: HTMLTextAreaElement,) {
    autoResizeImpl(el,);
  },
};

/**
 * Build the Alpine scope for the licensing panel partial.
 * @param actorId
 * @returns the licensing panel state bound to the actor.
 */
export function actorLicensingFactory(actorId: string,): ActorLicensingState {
  const raw = Object.create(actorLicensing,) as ActorLicensingState;
  // BUG-93b85cd: wrap the state in Alpine's reactive proxy BEFORE setActorId
  // fires the async loads. The old order built a raw Object.create'd object
  // and started loading immediately, so loadLicensing/loadLicenseHistory
  // continuations wrote license/licenseLoading onto the raw target — outside
  // Alpine's reactive proxy — leaving the panel frozen on 'Loading licensing…'.
  const alpine = (globalThis as { Alpine?: { reactive?: <T,>(value: T,) => T } }).Alpine;
  const state = alpine?.reactive ? alpine.reactive(raw,) : raw;
  state._licActorId = null;
  state.license = null;
  state.licenseForm = { ...EMPTY_FORM, };
  state.licenseLoading = false;
  state.licenseSaving = false;
  state.licenseError = "";
  state.licenseDirty = false;
  state.licenseHistory = [];
  state.setActorId(actorId,);
  return state;
}

(globalThis as Record<string, unknown>).actorLicensingFactory = actorLicensingFactory;
