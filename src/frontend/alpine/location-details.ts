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
import { jsonParseOr, } from "../../utils";
import { apiFetch, } from "./htmx";
import { log as rootLog, } from "./logger";
import type { NpcPresent, WorldLocationDetail, WorldPageState, } from "./world-types";

const log = rootLog.child({ module: "location-details", },);

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

  /** @returns {Promise<void>} */
  async selectLocation(id: string,) {
    if (this.selectedLocationId === id && this.detail) { return; }
    this.selectedLocationId = id;
    this.showItems = false;
    await this.loadLocationDetail(id,);
  },

  /** @returns {Promise<void>} */
  async loadLocationDetail(id: string,) {
    this.detailLoading = true;
    this.detailError = false;
    try {
      const detailRes = await apiFetch(`/api/v1/worlds/${this.worldId}/locations/${id}/details`, {
        headers: { Accept: "application/json", },
      },);

      const npcsRes = await apiFetch(`/api/v1/worlds/${this.worldId}/npcs-at/${id}`, {
        headers: { Accept: "application/json", },
      },);

      if (!detailRes.ok || !npcsRes.ok) {
        this.detailError = true;
        return;
      }

      const detailBody = (await detailRes.json()) as { data?: WorldLocationDetail };
      this.detail = detailBody.data ?? null;
      const npcBody = (await npcsRes.json()) as NpcPresent[];
      this.detailNpcs = Array.isArray(npcBody,) ? npcBody : [];
    } catch (error) {
      log.warn("location detail load failed", { error: String(error,), },);
      this.detailError = true;
    } finally {
      this.detailLoading = false;
    }
  },
};

/**
 * Parse a JSON string column (npcs_present / items_available / hazards)
 * into a string list. Tolerates numbers/objects by dropping them.
 * @param raw the raw column value
 */
export function parseJsonList(raw: string | null | undefined,): string[] {
  if (!raw) { return []; }
  const parsed = jsonParseOr<unknown>(raw, null,);
  if (!Array.isArray(parsed,)) { return []; }
  return parsed.filter((v,): v is string => typeof v === "string");
}
