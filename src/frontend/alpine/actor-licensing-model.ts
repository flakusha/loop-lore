// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Character licensing domain model.
// Types, dropdown options and label map shared by the licensing panel state
// plugin (`actor-licensing.ts`) and its tests.
import { LicenseType, } from "../../db/enums-character/content";

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

/** Audit entry for a licensing change (`character_license_history`). */
export interface LicenseHistoryEntry {
  id: string;
  license_type: string;
  attribution: string | null;
  changed_by: string;
  created_at: string;
}

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
  /** Audit trail of licensing changes, newest first. */
  licenseHistory: LicenseHistoryEntry[];
  /** Bind the panel to a specific actor; clears any prior license data. */
  setActorId(actorId: string,): void;
  /** Fetch the current licensing record (200 → populates; 404 → null). */
  loadLicensing(): Promise<void>;
  /** Fetch the licensing change history for the bound actor. */
  loadLicenseHistory(): Promise<void>;
  /** Mark the form as dirty and surface the changes in `licenseForm`. */
  markDirty(): void;
  /** POST the current `licenseForm` to the upsert endpoint. */
  save(): Promise<void>;
  /** DELETE the licensing record and clear `license`. */
  remove(): Promise<void>;
  /** Resolve a human label for a license type code. */
  describeLicense(code: string,): string;
  /** Resize a textarea to fit its content. */
  autoResize(el: HTMLTextAreaElement,): void;
}
