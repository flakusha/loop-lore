// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Gallery batch-operations state and methods (multi-select, server-zip
 * download, batch delete) — split from `core.ts` so it stays under its size
 * allow. Implemented by `chat-utils/gallery-batch.ts`.
 */
export interface ChatGalleryBatchState {
  /** Gallery asset ids picked for batch operations. Plain array so Alpine
   *  x-for iterates it directly; UI-only, never persisted server-side. */
  selectedAssetIds: string[];
  /** Last checkbox-toggled asset id — the anchor for shift-click range select. */
  _gallerySelectionAnchorId: string | null;

  toggleGalleryAssetSelection(assetId: string, shiftKey?: boolean,): void;
  selectAllVisibleGalleryAssets(): void;
  clearGalleryAssetSelection(): void;
  downloadSelectedAssets(): Promise<void>;
  deleteSelectedAssets(): Promise<void>;
}
