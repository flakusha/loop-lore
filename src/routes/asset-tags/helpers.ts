// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Asset tag routes — shared params and asset-resolution helpers.
 *
 * Extracted from `index.ts` to keep the route builder under the file-size gate.
 */
import { t, } from "elysia";
import type { Kysely, } from "kysely";
import { canAccessAsset, getAsset, } from "../../assets/service";
import type { AssetRecord, } from "../../assets/service";
import type { DB, } from "../../db/schema";
import { can, } from "../../users/permissions";
import { notFoundResponse, } from "../http-utils";

/** Route param schema shared by every `/assets/:id/tags*` endpoint. */
export const AssetIdParams = t.Object({ id: t.String(), },);

/** Whether a caller may edit `global`-scope tags on an asset. */
export function canCurateGlobal(userId: string, userRole: string | null, assetOwnerId: string,): boolean {
  if (assetOwnerId === userId) { return true; }
  return can(userRole, "admin.character",);
}

/** Load the asset and enforce visibility for an already-authenticated caller. */
export async function resolveAccessibleAsset(
  database: Kysely<DB>,
  id: string,
  userId: string,
  userRole: string | null,
): Promise<AssetRecord | Response> {
  const asset = await getAsset(database, id,);
  if (!asset) { return notFoundResponse("Asset not found",); }
  if (!(await canAccessAsset(database, id, userId, userRole,))) {
    return notFoundResponse("Asset not found",);
  }
  return asset;
}
