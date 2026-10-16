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
}

/** The paginated grid. `page`/`pageSize` echo the request the rows came from. */
export interface GalleryGridViewModel {
  assets: GalleryAssetItem[];
  page: number;
  pageSize: number;
}

/** The search result set — capped server-side, unpaginated like the htmx view. */
export interface GallerySearchViewModel {
  assets: GalleryAssetItem[];
}

/**
 * Project fetched asset rows into gallery rows, attaching visible tag names.
 * @param rows - already-fetched, already-filtered, already-ordered asset rows
 * @param tagMap - asset id → visible tag names (empty when a row has none)
 * @returns the shared JSON-able projection
 */
export function buildGalleryAssetItems(
  { rows, tagMap, }: { rows: readonly GalleryAssetRow[]; tagMap: ReadonlyMap<string, string[]> },
): GalleryAssetItem[] {
  return Array.from(rows, (row,) => ({
    id: row.id,
    filename: row.filename,
    assetType: row.asset_type,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
    thumbUrl: row.asset_type === "image" ? `/api/v1/assets/${row.id}/thumb` : null,
    tags: [...(tagMap.get(row.id,) ?? []),],
  }),);
}

/**
 * Project fetched rows into the gallery grid view-model.
 * @param rows - the page of asset rows in display order
 * @param tagMap - asset id → visible tag names
 * @param page - the 1-based page the rows came from
 * @param pageSize - the page size the query used
 * @returns the view-model the HTML card renderer and the JSON branch share
 */
export function buildGalleryGridViewModel(
  { rows, tagMap, page, pageSize, }: {
    rows: readonly GalleryAssetRow[];
    tagMap: ReadonlyMap<string, string[]>;
    page: number;
    pageSize: number;
  },
): GalleryGridViewModel {
  return { assets: buildGalleryAssetItems({ rows, tagMap, },), page, pageSize, };
}

/**
 * Project fetched rows into the gallery search view-model.
 * @param rows - the matching asset rows in display order
 * @param tagMap - asset id → visible tag names
 * @returns the view-model the HTML card renderer and the JSON branch share
 */
export function buildGallerySearchViewModel(
  { rows, tagMap, }: { rows: readonly GalleryAssetRow[]; tagMap: ReadonlyMap<string, string[]> },
): GallerySearchViewModel {
  return { assets: buildGalleryAssetItems({ rows, tagMap, },), };
}
