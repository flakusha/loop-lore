// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Gallery batch operations (selection + server-zip download + batch delete) —
 * split from `gallery.ts` so each file stays under the 250L gate. Spread into
 * `chatUtilsGallery`; methods run with the chat state as `this`.
 */
import { t, } from "../i18n";
import { jsonBody, } from "../json";
import type { ChatState, } from "../types";

export type ChatUtilsGalleryBatch = Partial<ChatState> & ThisType<ChatState>;

export const chatUtilsGalleryBatch: ChatUtilsGalleryBatch = {
  /**
   * Toggle one gallery asset for batch operations. With `shiftKey` and a
   * prior anchor click, range-select every loaded asset between the anchor
   * and this one instead of toggling.
   * @param assetId
   * @param shiftKey
   */
  toggleGalleryAssetSelection(assetId: string, shiftKey = false,): void {
    if (!assetId) { return; }
    const selected = new Set(this.selectedAssetIds,);

    if (shiftKey && this._gallerySelectionAnchorId) {
      const ids = this.galleryAssets.map((a,) => a.id);
      const from = ids.indexOf(this._gallerySelectionAnchorId,);
      const to = ids.indexOf(assetId,);
      if (from !== -1 && to !== -1) {
        const [start, end,] = from <= to ? [from, to,] : [to, from,];
        for (let i = start; i <= end; i++) {
          const id = ids[i];
          if (id) { selected.add(id,); }
        }

        this.selectedAssetIds = [...selected,];
        return;
      }
    }

    if (selected.has(assetId,)) {
      selected.delete(assetId,);
    } else {
      selected.add(assetId,);
    }

    this._gallerySelectionAnchorId = assetId;
    this.selectedAssetIds = [...selected,];
  },

  /** Select every asset currently loaded in the gallery sidebar. */
  selectAllVisibleGalleryAssets(): void {
    const selected = new Set(this.selectedAssetIds,);
    for (const asset of this.galleryAssets) {
      if (asset.id) { selected.add(asset.id,); }
    }

    this.selectedAssetIds = [...selected,];
  },

  /** Drop the whole gallery selection and the shift-click anchor. */
  clearGalleryAssetSelection(): void {
    this.selectedAssetIds = [];
    this._gallerySelectionAnchorId = null;
  },

  /**
   * Download the selected assets as one server-built zip. The server omits
   * inaccessible/NSFW-restricted/encrypted assets; an empty selection
   * surfaces as an error toast.
   */
  async downloadSelectedAssets() {
    const ids = this.selectedAssetIds;
    if (ids.length === 0) { return; }
    try {
      const res = await apiFetch("/api/v1/assets/batch-download", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ ids, },),
      },);

      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob,);
        const a = document.createElement("a",);
        a.href = url;
        a.download = "assets-batch.zip";
        a.click();
        URL.revokeObjectURL(url,);
        this.$dispatch?.("show-toast", {
          type: "success",
          message: t("toasts.galleryBatchDownloaded", { count: ids.length, },),
        },);
      } else {
        const err = await res.json().catch(() => ({ error: undefined, }));
        this.$dispatch?.("show-toast", {
          type: "error",
          message: err.error || t("toasts.galleryBatchDownloadFailed",),
        },);
      }
    } catch {
      this.$dispatch?.("show-toast", {
        type: "error",
        message: t("toasts.galleryBatchNetworkError",),
      },);
    }
  },

  /**
   * Delete the selected assets; the server deletes only caller-owned rows
   * and reports what was actually removed, then the sidebar refreshes.
   */
  async deleteSelectedAssets() {
    const ids = this.selectedAssetIds;
    if (ids.length === 0) { return; }
    try {
      const res = await apiFetch("/api/v1/assets/batch-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: jsonBody({ ids, },),
      },);

      if (res.ok) {
        const data = await res.json() as { deleted?: string[] };
        this.$dispatch?.("show-toast", {
          type: "success",
          message: t("toasts.galleryBatchDeleted", { count: data.deleted?.length ?? 0, },),
        },);

        this.clearGalleryAssetSelection();
        await this.loadGalleryAssets();
      } else {
        const err = await res.json().catch(() => ({ error: undefined, }));
        this.$dispatch?.("show-toast", {
          type: "error",
          message: err.error || t("toasts.galleryBatchDeleteFailed",),
        },);
      }
    } catch {
      this.$dispatch?.("show-toast", {
        type: "error",
        message: t("toasts.galleryBatchNetworkError",),
      },);
    }
  },
};
