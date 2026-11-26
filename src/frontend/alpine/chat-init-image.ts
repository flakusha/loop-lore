// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Init-image affordance for the img2img generation path.
 *
 * Reuses the existing asset upload endpoint (auth + size limits server-side)
 * and keeps only the returned asset id. The server re-proves ownership before
 * generation, so selecting an asset here grants no extra trust.
 */
import type { InitImageState, } from "./chat-types/init-image-state";
import { apiFetch, } from "./htmx";
import { t, } from "./i18n";
import { log as rootLog, } from "./logger";

const log = rootLog.child({ module: "chat-init-image", },);

export const chatInitImage: Partial<InitImageState> & ThisType<InitImageState> = {
  _initImage: { assetId: null, filename: "", uploading: false, error: "", },

  async attachInitImage(file: File,) {
    if (!file) { return; }
    this._initImage.uploading = true;
    this._initImage.error = "";

    const form = new FormData();
    form.append("file", file,);
    form.append("alt_text", file.name,);
    try {
      const res = await apiFetch("/api/v1/assets", { method: "POST", body: form, },);
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        this._initImage.error = err.error || t("toasts.failedUpload", { filename: file.name, },);
        this._initImage.assetId = null;
        return;
      }

      const asset = await res.json() as { id?: string; filename?: string };
      if (!asset.id) {
        this._initImage.error = t("toasts.failedUpload", { filename: file.name, },);
        return;
      }

      this._initImage.assetId = asset.id;
      this._initImage.filename = asset.filename ?? file.name;
      log.info("init image attached", { assetId: asset.id, },);
    } catch {
      this._initImage.error = t("toasts.failedUpload", { filename: file.name, },);
      this._initImage.assetId = null;
    } finally {
      this._initImage.uploading = false;
    }
  },

  selectInitImage(assetId: string, filename?: string,) {
    this._initImage = { assetId, filename: filename ?? assetId, uploading: false, error: "", };
  },

  clearInitImage() {
    this._initImage = { assetId: null, filename: "", uploading: false, error: "", };
  },

  initImageBody() {
    const assetId = this._initImage?.assetId;
    return assetId ? { init_image: assetId, workflow: "img2img", } : {};
  },
};
