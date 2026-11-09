// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NSFW private spaces — venue suitability for the current chat location
 * (EPIC-NSFW-UI housing slice, TASK-nsfw-housing-management).
 *
 * Housing itself is owned by `epic-housing` (`/api/housing/*` does not
 * exist yet — see TASK-housing-frontend). This module is the NSFW-owned
 * remainder only: a read-only suitability view over the existing gated
 * `GET /api/v1/nsfw/location/:locationId` config, driven by the chat's
 * current location (`_chatCurrentLocationId`). No new backend contract:
 * suitability reuses `isSuitableForEncounter`'s privacy rule
 * (private/isolated clear the bar; the default bedroom/private config
 * clears it too).
 */

import { t, } from "../alpine/i18n";

/** Raw NSFW location config as returned by GET /api/v1/nsfw/location/:id. */
export interface NsfwLocationConfigRow {
  locationId?: string;
  locationType?: string;
  privacyLevel?: string;
}

/** Venue suitability as rendered by the private-spaces view. */
export interface PrivateSpaceView {
  /** Chat's current location id. */
  locationId: string;
  /** Stored location type (bedroom, bath, …) or null when unset. */
  locationType: string | null;
  /** Stored privacy tier. */
  privacyLevel: string;
  /** Whether the venue clears the encounter privacy bar. */
  suitable: boolean;
}

/**
 * Fetch the NSFW config for one location (same denied/failed contract as
 * the read-only status panel: 403 → denied, other non-2xx → failed).
 *
 * Takes the fetch implementation as a parameter so this pure module never
 * imports `../alpine/htmx` (which registers document listeners at load and
 * breaks shared-process fake-DOM suites).
 * @param locationId - chat's current location id
 * @param fetchImpl - fetch implementation (`apiFetch` in production)
 * @returns {Promise<{ status: "ok"; data: NsfwLocationConfigRow } | { status: "denied" } | { status: "failed" }>} the fetch outcome
 */
export async function fetchLocationConfig(
  locationId: string,
  fetchImpl: (url: string,) => Promise<Response>,
): Promise<
  | { status: "ok"; data: NsfwLocationConfigRow }
  | { status: "denied" }
  | { status: "failed" }
> {
  try {
    const res = await fetchImpl(`/api/v1/nsfw/location/${locationId}`,);
    if (res.status === 403) { return { status: "denied", }; }
    if (!res.ok) { return { status: "failed", }; }
    try {
      return { status: "ok", data: (await res.json()) as NsfwLocationConfigRow, };
    } catch {
      return { status: "failed", };
    }
  } catch {
    return { status: "failed", };
  }
}

/**
 * Map a location config row onto the suitability view.
 *
 * Mirrors `isSuitableForEncounter`'s default bar (`semi_private`): public
 * venues fail, everything at semi_private or above clears it.
 * @param locationId - chat's current location id
 * @param row - raw backend config row
 * @returns {PrivateSpaceView} the suitability view
 */
export function toPrivateSpaceView(locationId: string, row: NsfwLocationConfigRow,): PrivateSpaceView {
  const order: Record<string, number> = { public: 0, semi_private: 1, private: 2, isolated: 3, };
  const tier = order[row.privacyLevel ?? ""] ?? 0;
  return {
    locationId,
    locationType: typeof row.locationType === "string" && row.locationType.length > 0 ? row.locationType : null,
    privacyLevel: row.privacyLevel ?? "public",
    suitable: tier >= 1,
  };
}

/**
 * Render the private-spaces section for the chat's current venue.
 * @param view - suitability view, or null when nothing is renderable
 * @returns {HTMLElement | null} the section, or null when there is nothing to show
 */
export function renderPrivateSpace(view: PrivateSpaceView | null,): HTMLElement | null {
  if (!view) { return null; }
  const section = document.createElement("section",);
  section.className = "nsfw-private-space";
  section.setAttribute("role", "group",);
  section.setAttribute("aria-label", t("nsfw.privateSpace.title",),);
  section.dataset.testid = "nsfw-private-space";

  const title = document.createElement("h4",);
  title.className = "nsfw-title";
  title.textContent = t("nsfw.privateSpace.title",);
  section.append(title,);

  const verdict = document.createElement("div",);
  verdict.className = "nsfw-private-space-verdict";
  verdict.dataset.testid = "nsfw-private-space-verdict";
  verdict.textContent = t(view.suitable ? "nsfw.privateSpace.suitable" : "nsfw.privateSpace.unsuitable", {
    privacy: view.privacyLevel,
  },);

  section.append(verdict,);

  if (view.locationType) {
    const kind = document.createElement("div",);
    kind.className = "nsfw-private-space-kind";
    kind.dataset.testid = "nsfw-private-space-kind";
    kind.textContent = t("nsfw.privateSpace.kindFmt", { kind: view.locationType, },);
    section.append(kind,);
  }

  return section;
}
