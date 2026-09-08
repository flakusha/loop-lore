// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Asset tier providers — `exact` lookup and `fuzzy` relevance ranking.
 *
 * No FTS table covers assets, so `fuzzy` fetches the viewer's visible
 * candidate set (same `visibleAssetFilter` model as the gallery grid and
 * `listAssets`: public, owned, or explicitly shared — admins see all) and
 * ranks in memory with the shared `fuzzyScore` baseline. The candidate set
 * is capped so thousand-asset libraries cannot blow the request budget;
 * the gallery search endpoint pages over these ranked hits.
 */
import type { Kysely, } from "kysely";
import { visibleAssetFilter, } from "../../assets/service/read";
import type { DB, } from "../../db";
import { AssetType, } from "../../db/enums";
import { can, } from "../../users/permissions";
import { fuzzyScore, } from "../rank";
import type { SearchHit, SearchScope, TierProvider, } from "../types";

/** Upper bound on candidates pulled for in-memory ranking. */
export const ASSET_FUZZY_CANDIDATE_CAP = 2000;

/** Payload carried on asset hits. */
export interface AssetHit {
  /** assets.id. */
  assetId: string;
  /** Original file name (ranked). */
  filename: string;
  /** Author-provided description (ranked). */
  altText: string | null;
  /** image, audio, video, … */
  assetType: string;
  /** MIME type. */
  mimeType: string;
  /** public, private, shared. */
  visibility: string;
}

interface AssetRow {
  id: string;
  filename: string;
  alt_text: string | null;
  asset_type: string;
  mime_type: string;
  visibility: string;
}

function toHit(row: AssetRow, score: number, source: SearchHit["source"],): SearchHit<AssetHit> {
  return {
    id: row.id,
    score,
    source,
    payload: {
      assetId: row.id,
      filename: row.filename,
      altText: row.alt_text,
      assetType: row.asset_type,
      mimeType: row.mime_type,
      visibility: row.visibility,
    },
  };
}

function assetTypeFilter(value: unknown,): AssetType | null {
  if (typeof value !== "string") { return null; }
  if (!(Object.values(AssetType,) as readonly string[]).includes(value,)) { return null; }
  return value as AssetType;
}

/**
 * Create DB-backed asset tier providers.
 * @param db - typed Kysely instance
 * @param userRole - viewer role for the admin bypass (null for anonymous)
 * @returns exact/fuzzy providers for the service
 */
export function createAssetProviders(
  db: Kysely<DB>,
  userRole: string | null = null,
): { exact: TierProvider<AssetHit>; fuzzy: TierProvider<AssetHit> } {
  const exact: TierProvider<AssetHit> = async (query, scope,) => {
    if (scope.kind !== "assets") { return []; }
    let qb = db
      .selectFrom("assets",)
      .select(["id", "filename", "alt_text", "asset_type", "mime_type", "visibility",],)
      .where("id", "=", query.q,);
    if (!isAdmin(scope, userRole,)) {
      qb = qb.where((eb,) => visibleAssetFilter(eb, scope.userId,));
    }
    const row = await qb.executeTakeFirst();
    if (row === undefined) { return []; }
    return [toHit(row, 1, "db",),];
  };

  const fuzzy: TierProvider<AssetHit> = async (query, scope,) => {
    if (scope.kind !== "assets") { return []; }
    const assetType = assetTypeFilter(query.filters?.assetType,);
    let qb = db
      .selectFrom("assets",)
      .select(["id", "filename", "alt_text", "asset_type", "mime_type", "visibility",],)
      .orderBy("created_at", "desc",)
      .limit(ASSET_FUZZY_CANDIDATE_CAP,);
    if (!isAdmin(scope, userRole,)) {
      qb = qb.where((eb,) => visibleAssetFilter(eb, scope.userId,));
    }
    if (scope.visibility !== undefined) { qb = qb.where("visibility", "=", scope.visibility,); }
    if (assetType !== null) { qb = qb.where("asset_type", "=", assetType,); }
    const rows = await qb.execute();
    const topK = query.topK ?? 20;
    const minScore = query.minScore ?? 0;
    return rows
      .map((row,) => ({ row, score: fuzzyScore(query.q, `${row.filename} ${row.alt_text ?? ""}`,), }))
      .filter((entry,) => entry.score > 0 && entry.score >= minScore)
      .sort((a, b,) => b.score - a.score)
      .slice(0, topK,)
      .map((entry,) => toHit(entry.row, entry.score, "fuzzy",));
  };

  return { exact, fuzzy, };
}

function isAdmin(scope: Extract<SearchScope, { kind: "assets" }>, userRole: string | null,): boolean {
  return scope.isAdmin === true || can(userRole, "admin.character",);
}
