// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { t, } from "./i18n";
import { jsonBody, } from "./json";

/** Minimal host surface the shared location-edit actions need. */
export interface LocationEditHost {
  worldId: string;
  expandedLoc: string;
  locations: Array<{ id: string; name: string; description: string | null }>;
  editLocName: string;
  editLocDesc: string;
  loadLocations(): Promise<void>;
}

/**
 * Expand/collapse + save actions for inline location editing, shared by the
 * world-edit page store (pages/worlds.ts) and the Locations tab mixin
 * (world-locations.ts).
 */
export const locationEditActions = {
  /**
   * Toggle the inline editor for one location.
   * @param {string} locId
   * @returns {void}
   */
  expandLoc(this: LocationEditHost, locId: string,) {
    if (this.expandedLoc === locId) {
      this.expandedLoc = "";
      return;
    }

    this.expandedLoc = locId;
    const loc = this.locations.find((l,) => l.id === locId);
    if (loc) {
      this.editLocName = loc.name;
      this.editLocDesc = loc.description || "";
    }
  },

  /**
   * Persist the inline edit for one location.
   * @param {string} locId
   * @returns {Promise<void>}
   */
  async saveLocation(this: LocationEditHost, locId: string,) {
    try {
      const res = await apiFetch(`/api/v1/worlds/${this.worldId}/locations/${locId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({
          name: this.editLocName.trim(),
          description: this.editLocDesc.trim() || null,
        },),
      },);

      if (res.ok) {
        const loc = this.locations.find((l,) => l.id === locId);
        if (loc) {
          loc.name = this.editLocName.trim();
          loc.description = this.editLocDesc.trim() || null;
        }

        this.expandedLoc = "";
        showToast("success", t("toasts.locationUpdated",),);
      } else {
        const err = await res.json();
        showToast("error", err.message || t("toasts.failed",),);
      }
    } catch {
      showToast("error", t("toasts.networkError",),);
    }
  },
};
