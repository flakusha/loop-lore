// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Download naming resolution — shared by the single-asset download route
 * and the batch routes.
 *
 * Precedence: per-request `naming` override, else the caller's
 * `asset_user_preferences` row, else the admin `assets.downloadNaming`
 * default. Unknown values at any level fall through (never 400: a stale
 * bookmark or a hand-written config string must not break downloads).
 */
import type { Kysely, } from "kysely";
import type { Config, } from "../config/schema";
import type { DB, } from "../db/schema";
import { DOWNLOAD_NAMING_MODES, type DownloadNaming, normalizeNamingMode, } from "./service/download-naming";
import { getDownloadNaming, } from "./service/download-preferences";

const KNOWN = new Set<string>(DOWNLOAD_NAMING_MODES,);

/**
 * @param options
 * @param options.database
 * @param options.config
 * @param options.userId - null for session-less (signed-URL) downloads: skips the user row.
 * @param options.override - per-request naming mode, when supplied.
 * @returns the effective download naming mode.
 */
export async function resolveEffectiveNaming(options: {
  database: Kysely<DB>;
  config: Config;
  userId: string | null;
  override?: string | null;
},): Promise<DownloadNaming> {
  const { database, config, userId, override, } = options;
  if (override && KNOWN.has(override,)) { return override as DownloadNaming; }
  if (userId) {
    const pref = await getDownloadNaming(database, userId,);
    if (pref) { return pref; }
  }

  return normalizeNamingMode(config.assets.downloadNaming,);
}
