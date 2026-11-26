// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Asset Service — download file naming.
 *
 * One naming rule for the single-asset download (`Content-Disposition`)
 * and the batch-zip entry names, so both surfaces stay consistent. The
 * caller resolves the effective mode (per-request override, else the
 * user's `asset_user_preferences` row, else the admin
 * `assets.downloadNaming` default); this module only renders it.
 */

/** Download naming modes: raw app-storage name, datetime prefix, content-hash prefix, or both. */
export const DOWNLOAD_NAMING_MODES = ["raw", "datetime", "hash", "datetime-hash",] as const;

export type DownloadNaming = (typeof DOWNLOAD_NAMING_MODES)[number];

/** @param mode - candidate mode string (config file, query param, prefs row) @returns the mode when known, else `raw`. */
export function normalizeNamingMode(mode: string | null | undefined,): DownloadNaming {
  return (DOWNLOAD_NAMING_MODES as readonly string[]).includes(mode ?? "",) ? (mode as DownloadNaming) : "raw";
}

/**
 * Render the download filename for an asset row.
 * @param asset - id, storage filename, creation time, and content hash (null when dedupe is off).
 * @param mode - naming mode; `raw` is the historical behavior.
 * @returns filesystem-safe filename (same sanitization as the single-download path).
 */
export function downloadFileName(
  asset: { id: string; filename: string; created_at: string; content_hash: string | null },
  mode: DownloadNaming,
): string {
  const safe = asset.filename.replaceAll(/[^\w.-]+/g, "_",);
  if (mode === "raw") { return safe; }
  const stamp = asset.created_at.replaceAll(/\D+/g, "",).slice(0, 14,);
  const hash = (asset.content_hash || asset.id.replaceAll(/-/g, "",)).slice(0, 8,);
  if (mode === "datetime") { return `${stamp}_${safe}`; }
  if (mode === "hash") { return `${hash}_${safe}`; }
  return `${stamp}_${hash}_${safe}`;
}
