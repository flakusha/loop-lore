// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Asset Service — per-user download preferences.
 *
 * Reads/writes the `asset_user_preferences` row. A missing row (or a NULL
 * `download_naming`) means "follow the admin `assets.downloadNaming`
 * default" — the read path never materialises phantom rows.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { type DownloadNaming, normalizeNamingMode, } from "./download-naming";

/** @param database @param userId @returns the user's override, or null to follow the admin default. */
export async function getDownloadNaming(
  database: Kysely<DB>,
  userId: string,
): Promise<DownloadNaming | null> {
  const row = await database
    .selectFrom("asset_user_preferences",)
    .select("download_naming",)
    .where("user_id", "=", userId,)
    .executeTakeFirst();

  if (!row?.download_naming) { return null; }
  return normalizeNamingMode(row.download_naming,);
}

/**
 * Upsert the user's download-naming override; null clears it back to the admin default.
 * @param database
 * @param userId
 * @param mode
 * @returns the effective override (null when cleared).
 */
export async function setDownloadNaming(
  database: Kysely<DB>,
  userId: string,
  mode: DownloadNaming | null,
): Promise<DownloadNaming | null> {
  const now = new Date().toISOString();
  await database
    .insertInto("asset_user_preferences",)
    .values({ user_id: userId, download_naming: mode, created_at: now, updated_at: now, },)
    .onConflict((oc,) => oc.column("user_id",).doUpdateSet({ download_naming: mode, updated_at: now, },))
    .execute();

  return mode;
}
