// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Location details panel mixin for the world page (TASK-location-details).
 * Loads the enriched detail feed from the location-explorer route
 * (`GET /worlds/:worldId/locations/:locId/details` — description, parent,
 * connections, location state) plus the NPCs present from the story-states
 * feed (`GET /worlds/:worldId/npcs-at/:locId`). The quick actions live in
 * location-actions.ts; this slice is the read-only picture of a place.
 */
import { parseJsonList, } from "../../utils/safe-json";
import { fetchWorldJson, } from "./world-fetch";
import type { NpcPresent, WorldLocationDetail, WorldPageState, } from "./world-types";

/** Detail + NPC state for the world page. */
export const locationDetails: Partial<WorldPageState> & ThisType<WorldPageState> = {
  selectedLocationId: "",
  detail: null,
  detailLoading: false,
  detailError: false,
  detailNpcs: [],
  showItems: false,

  /** Hazards of the selected location's state, as a string list. */
  /** @returns {string[]} */
  get detailHazards(): string[] {
    return parseJsonList(this.detail?.state?.hazards,);
  },

  /** Items available at the selected location, as a string list. */
  /** @returns {string[]} */
  get detailItems(): string[] {
    return parseJsonList(this.detail?.state?.items_available,);
  },

  /**
   * @param id
   * @returns {Promise<void>}
   */
  async selectLocation(id: string,) {
    if (this.selectedLocationId === id && this.detail) { return; }
    this.selectedLocationId = id;
    this.showItems = false;
    await this.loadLocationDetail(id,);
  },

  /**
   * @param id
   * @returns {Promise<void>}
   */
  async loadLocationDetail(id: string,) {
    this.detailLoading = true;
    this.detailError = false;
    try {
      const detailBody = await fetchWorldJson<{ data?: WorldLocationDetail }>(
        this.worldId,
        `/locations/${id}/details`,
      );

      const npcBody = await fetchWorldJson<NpcPresent[]>(this.worldId, `/npcs-at/${id}`,);

      if (detailBody === null || npcBody === null) {
        this.detailError = true;
        return;
      }

      this.detail = detailBody.data ?? null;
      this.detailNpcs = Array.isArray(npcBody,) ? npcBody : [];
    } catch {
      this.detailError = true;
    } finally {
      this.detailLoading = false;
    }
  },
};
