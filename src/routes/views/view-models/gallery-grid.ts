// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * View-model for `/dynamic/gallery/grid` and `/dynamic/gallery/search` — the
 * seam a non-htmx client (the experimental egui frontend) consumes instead of
 * parsing the asset cards.
 *
 * `buildGalleryGridViewModel()` / `buildGallerySearchViewModel()` are pure:
 * already-fetched rows in, plain JSON-able data out. No database handle, no
 * request context, no `await`, no HTML. Values are raw and unescaped, so the
 * HTML renderer and the JSON branch cannot drift.
 */

import type { AssetType, } from "../../../db/enums";

/** The subset of an `assets` row the gallery projects. */
export interface GalleryAssetRow {
  id: string;
  filename: string;
  asset_type: AssetType;
  size_bytes: number;
  created_at: string;
}

/** One asset row. `thumbUrl` is `null` for non-image assets (the card renders an icon). */
export interface GalleryAssetItem {
  id: string;
  filename: string;
  assetType: AssetType;
  sizeBytes: number;
  createdAt: string;
  thumbUrl: string | null;
  /** Visible tag names — global plus the viewer's own user-scoped tags. */
  tags: string[];
  /** v1 rating signal: linked to an NSFW-rated actor (coverable by the user blur preference). */
  nsfw: boolean;
}

/** The paginated grid. `page`/`pageSize` echo the request the rows came from. */
export interface GalleryGridViewModel {
  assets: GalleryAssetItem[];
  page: number;
  pageSize: number;
}

/** The paginated search result set. `page`/`pageSize` echo the request the rows came from. */
export interface GallerySearchViewModel {
  assets: GalleryAssetItem[];
  page: number;
  pageSize: number;
}

/**
 * Project fetched asset rows into gallery rows, attaching visible tag names.
 * @param rows - already-fetched, already-filtered, already-ordered asset rows
 * @param tagMap - asset id → visible tag names (empty when a row has none)
 * @param nsfwIds - asset ids linked to an NSFW-rated actor (the v1 rating signal)
 * @returns the shared JSON-able projection
 */
export function buildGalleryAssetItems(
  { rows, tagMap, nsfwIds, }: {
    rows: readonly GalleryAssetRow[];
    tagMap: ReadonlyMap<string, string[]>;
    nsfwIds: ReadonlySet<string>;
  },
): GalleryAssetItem[] {
  return Array.from(rows, (row,) => ({
    id: row.id,
    filename: row.filename,
    assetType: row.asset_type,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
    thumbUrl: row.asset_type === "image" ? `/api/v1/assets/${row.id}/thumb` : null,
    tags: [...(tagMap.get(row.id,) ?? []),],
    nsfw: nsfwIds.has(row.id,),
  }),);
}

/** Shared projection inputs for the grid and search builders. */
export interface GalleryBuilderArgs {
  /** The page of asset rows in display order. */
  rows: readonly GalleryAssetRow[];
  /** Asset id → visible tag names. */
  tagMap: ReadonlyMap<string, string[]>;
  /** Asset ids linked to an NSFW-rated actor (the v1 rating signal). */
  nsfwIds: ReadonlySet<string>;
  /** The 1-based page the rows came from. */
  page: number;
  /** The page size the query used. */
  pageSize: number;
}

/**
 * Project fetched rows into the gallery grid view-model — the view-model the
 * HTML card renderer and the JSON branch share.
 * @param args - rows, tag names, NSFW ids, and the request's page echo
 * @returns {GalleryGridViewModel}
 */
export function buildGalleryGridViewModel(args: GalleryBuilderArgs,): GalleryGridViewModel {
  return { assets: buildGalleryAssetItems(args,), page: args.page, pageSize: args.pageSize, };
}

/**
 * Project fetched rows into the gallery search view-model — same projection
 * as the grid builder; the two result types are structurally identical.
 * @param args - rows, tag names, NSFW ids, and the request's page echo
 * @returns {GallerySearchViewModel}
 */
export function buildGallerySearchViewModel(args: GalleryBuilderArgs,): GallerySearchViewModel {
  return buildGalleryGridViewModel(args,);
}
