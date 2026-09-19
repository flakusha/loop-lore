// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Character license enforcement for export/share boundaries (TASK-030).
 *
 * Exported or shared character cards carry the creator's license as
 * `data.extensions.license` and surface warnings via the `X-License-Warning`
 * response header — notably when an attribution-required CC-BY license has
 * no attribution set.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { safeJsonParse, safeJsonStringify, } from "../utils";

/** License types that require attribution on reuse. */
const ATTRIBUTION_REQUIRED: ReadonlySet<string> = new Set([
  "cc_by",
  "cc_by_sa",
  "cc_by_nc",
  "cc_by_nc_sa",
],);

/** Plain (non-Generated) view of a licensing row at export boundaries. */
export interface LicenseInfo {
  license_type: string;
  custom_license_text: string | null;
  attribution: string | null;
  allow_derivatives: number;
  allow_commercial: number;
  share_alike: number;
}

/**
 * Fetch the licensing row for an actor (null when unset).
 * @param db
 * @param actorId
 * @returns the licensing row, or null when unset
 */
export async function getActorLicensing(
  db: Kysely<DB>,
  actorId: string,
): Promise<LicenseInfo | null> {
  return (
    (await db
      .selectFrom("character_licensing",)
      .selectAll()
      .where("actor_id", "=", actorId,)
      .executeTakeFirst()) ?? null
  );
}

/**
 * Reuse warnings for a licensing row (empty when unencumbered).
 * @param licensing
 * @returns attribution warnings, empty when unencumbered
 */
export function licenseWarnings(licensing: LicenseInfo,): string[] {
  const warnings: string[] = [];
  if (
    ATTRIBUTION_REQUIRED.has(licensing.license_type,) &&
    !licensing.attribution
  ) {
    warnings.push(
      `License ${licensing.license_type} requires attribution on reuse, but no attribution is set on this character`,
    );
  }
  return warnings;
}

/**
 * Response headers declaring the exported card's license and any reuse
 * warnings.
 * @param licensing
 * @returns export response headers declaring the license
 */
export function licenseHeaders(licensing: LicenseInfo | null,): Record<string, string> {
  if (!licensing) { return {}; }
  const headers: Record<string, string> = {
    "X-License-Type": licensing.license_type,
  };
  const warnings = licenseWarnings(licensing,);
  if (warnings.length > 0) {
    headers["X-License-Warning"] = warnings.join("; ",);
  }
  return headers;
}

/**
 * The `extensions.license` payload embedded into exported character cards.
 * @param licensing
 * @returns the extensions.license payload for exported cards
 */
export function licenseExtension(licensing: LicenseInfo,): Record<string, unknown> {
  return {
    license_type: licensing.license_type,
    custom_license_text: licensing.custom_license_text,
    attribution: licensing.attribution,
    allow_derivatives: licensing.allow_derivatives,
    allow_commercial: licensing.allow_commercial,
    share_alike: licensing.share_alike,
  };
}

/**
 * Embed the license as `data.extensions.license` in a character-card JSON
 * payload (CCv2/CCv3 shape). Unparseable payloads are returned unchanged.
 * @param json
 * @param licensing
 * @returns the payload with the license embedded (unchanged when unparseable/unlicensed)
 */
export function withLicenseExtension(json: string, licensing: LicenseInfo | null,): string {
  if (!licensing) { return json; }
  const parsed = safeJsonParse<Record<string, unknown>>(json,);
  if (!parsed.ok || typeof parsed.value !== "object" || parsed.value === null) {
    return json;
  }
  const card = parsed.value;
  const data = card["data"];
  if (typeof data !== "object" || data === null) { return json; }
  const dataRecord = data as Record<string, unknown>;
  const extensions = typeof dataRecord["extensions"] === "object" && dataRecord["extensions"] !== null
    ? dataRecord["extensions"] as Record<string, unknown>
    : {};
  extensions["license"] = licenseExtension(licensing,);
  dataRecord["extensions"] = extensions;
  const serialized = safeJsonStringify(card, 2,);
  return serialized.ok ? serialized.value : json;
}
