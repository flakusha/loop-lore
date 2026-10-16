// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Gallery card markup — the one renderer for the gallery grid and the gallery
 * search. Both consume the same view-model the JSON branch serves, so a
 * field the htmx card binds cannot exist in one representation and not the
 * other.
 */

import type { AssetType, } from "../../db/enums";
import { escapeHtml, } from "./layout";
import type { GalleryGridViewModel, GallerySearchViewModel, } from "./view-models/gallery-grid";

/**
 * @param bytes
 * @returns the asset size as a short human-readable string
 */
export function formatSize(bytes: number,): string {
  if (bytes < 1024) { return `${bytes} B`; }
  if (bytes < 1_048_576) { return `${(bytes / 1024).toFixed(1,)} KB`; }
  return `${(bytes / 1_048_576).toFixed(1,)} MB`;
}

/**
 * @param viewModel - the grid or search view-model; only `assets` is read
 * @returns the asset card markup, or the empty state when there are no assets
 */
export function renderGalleryCards(viewModel: GalleryGridViewModel | GallerySearchViewModel,): string {
  if (viewModel.assets.length === 0) { return renderGalleryEmptyState("grid",); }
  const cards = viewModel.assets.map((a,) => {
    const filename = escapeHtml(a.filename,);
    const size = formatSize(a.sizeBytes,);
    const tags = escapeHtml(a.tags.join(",",),);
    return `<div class="asset-card" data-tags="${tags}" tabindex="0" role="button" x-on:click="window.openAssetPreviewById('${a.id}')" x-on:keydown.enter.prevent="window.openAssetPreviewById('${a.id}')" x-on:keydown.space.prevent="window.openAssetPreviewById('${a.id}')" data-testid="asset-card-${a.id}">
      <div class="thumb">${thumbForAsset(a,)}</div>
      <div class="details">
        <span class="name">${filename}</span>
        <span class="type">${size}</span>
      </div>
    </div>`;
  },);

  return cards.join("",);
}

/**
 * @param message
 * @returns the error card shown for an invalid filter combination
 */
export function renderGalleryErrorCard(message: string,): string {
  return `<div class="empty-state" style="grid-column:1/-1" data-testid="gallery-empty">
    <div class="title">${escapeHtml(message,)}</div>
  </div>`;
}

/**
 * @param variant - whose empty state to render
 * @returns the empty-state markup; the search words it differently
 */
export function renderGalleryEmptyState(variant: "grid" | "search",): string {
  if (variant === "search") {
    return `<div class="empty-state" style="grid-column:1/-1" data-testid="gallery-empty">
      <div class="icon">📁</div>
      <div class="title">No assets match your search</div>
      <div class="description">Try different search terms.</div>
    </div>`;
  }

  return `<div class="empty-state" style="grid-column:1/-1" data-testid="gallery-empty">
      <div class="icon">📁</div>
      <div class="title">No assets found</div>
      <div class="description">Upload images, audio, or video to get started.</div>
    </div>`;
}

/**
 * @param a - the view-model asset row
 * @returns the thumbnail markup: an `<img>` for images, an icon otherwise
 */
function thumbForAsset(a: { id: string; filename: string; assetType: AssetType; thumbUrl: string | null },): string {
  if (a.thumbUrl !== null) {
    return `<img src="${a.thumbUrl}" alt="${escapeHtml(a.filename,)}" loading="lazy" />`;
  }

  switch (a.assetType) {
    case "image": {
      return `<img src="/api/v1/assets/${a.id}/thumb" alt="${escapeHtml(a.filename,)}" loading="lazy" />`;
    }

    case "audio": {
      return `<div class="file-icon">🎵</div>`;
    }

    case "video": {
      return `<div class="file-icon">🎬</div>`;
    }

    case "other":
    case "memory": {
      return `<div class="file-icon">📄</div>`;
    }
  }
}
