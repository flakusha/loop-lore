// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Character licensing panel.
// Drives `/api/actors/:actorId/licensing` (GET / POST / DELETE). Pairs with
// `src/components/character/licensing-panel.html`.
import { LicenseType, } from "../../db/enums-character/content";
import { apiFetch, } from "./htmx";
import { t, } from "./i18n";
import { jsonBody, } from "./json";
import { log as rootLog, } from "./logger";

const log = rootLog.child({ module: "actor-licensing", },);

/** All license type options surfaced in the editor dropdown. */
export const LICENSE_TYPES: string[] = Object.values(LicenseType,);

/** License row returned by the GET endpoint (matches `character_licensing` shape). */
export interface CharacterLicensing {
  id: string;
  actor_id: string;
  license_type: string;
  custom_license_text: string | null;
  attribution: string | null;
  allow_derivatives: number;
  allow_commercial: number;
  share_alike: number;
  created_at: string;
  updated_at: string;
}

/** Human label for a license type. */
const LICENSE_LABELS: Record<string, string> = {
  cc0: "CC0 (Public Domain)",
  cc_by: "CC BY",
  cc_by_sa: "CC BY-SA",
  cc_by_nc: "CC BY-NC",
  cc_by_nc_sa: "CC BY-NC-SA",
  proprietary: "Proprietary",
  custom: "Custom",
};

/**
 * State plugin for the character-licensing panel. Bound to a single actor via
 * `setActorId`. Read-only by default; `save()` POSTs the current draft; the
 * panel toggles into "edit mode" by mutating `licenseForm` in-place.
 */
export interface ActorLicensingState {
  _licActorId: string | null;
  license: CharacterLicensing | null;
  licenseForm: {
    license_type: string;
    custom_license_text: string;
    attribution: string;
    allow_derivatives: boolean;
    allow_commercial: boolean;
    share_alike: boolean;
  };
  licenseLoading: boolean;
  licenseSaving: boolean;
  licenseError: string;
  licenseDirty: boolean;
  /** Bind the panel to a specific actor; clears any prior license data. */
  setActorId(actorId: string,): void;
  /** Fetch the current licensing record (200 → populates; 404 → null). */
  loadLicensing(): Promise<void>;
  /** Mark the form as dirty and surface the changes in `licenseForm`. */
  markDirty(): void;
  /** POST the current `licenseForm` to the upsert endpoint. */
  save(): Promise<void>;
  /** DELETE the licensing record and clear `license`. */
  remove(): Promise<void>;
  /** Resolve a human label for a license type code. */
  describeLicense(code: string,): string;
}

const EMPTY_FORM: ActorLicensingState["licenseForm"] = {
  license_type: "proprietary",
  custom_license_text: "",
  attribution: "",
  allow_derivatives: true,
  allow_commercial: false,
  share_alike: false,
};

export const actorLicensing: ActorLicensingState = {
  _licActorId: null,
  license: null,
  licenseForm: { ...EMPTY_FORM, },
  licenseLoading: false,
  licenseSaving: false,
  licenseError: "",
  licenseDirty: false,

  setActorId(actorId: string,) {
    if (this._licActorId === actorId) { return; }
    this._licActorId = actorId;
    this.license = null;
    this.licenseForm = { ...EMPTY_FORM, };
    this.licenseError = "";
    this.licenseDirty = false;
    void this.loadLicensing();
  },

  async loadLicensing() {
    const actorId = this._licActorId;
    if (!actorId) { return; }
    this.licenseLoading = true;
    try {
      const res = await apiFetch(`/api/actors/${actorId}/licensing`,);
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
      log.error("Failed to load licensing", error instanceof Error ? error : undefined, {},);
      this.licenseError = t("status.licensingLoadFailed",);
    } finally {
      this.licenseLoading = false;
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
      const res = await apiFetch(`/api/actors/${actorId}/licensing`, {
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
      const res = await apiFetch(`/api/actors/${actorId}/licensing`, { method: "DELETE", },);
      if (!res.ok) {
        this.licenseError = t("status.licensingDeleteFailed",);
        return;
      }
      this.license = null;
      this.licenseForm = { ...EMPTY_FORM, };
      this.licenseDirty = false;
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
};

/** Build the Alpine scope for the licensing panel partial. */
export function actorLicensingFactory(actorId: string,): ActorLicensingState {
  const state = Object.create(actorLicensing,) as ActorLicensingState;
  state._licActorId = null;
  state.license = null;
  state.licenseForm = { ...EMPTY_FORM, };
  state.licenseLoading = false;
  state.licenseSaving = false;
  state.licenseError = "";
  state.licenseDirty = false;
  state.setActorId(actorId,);
  return state;
}

(globalThis as Record<string, unknown>).actorLicensingFactory = actorLicensingFactory;
