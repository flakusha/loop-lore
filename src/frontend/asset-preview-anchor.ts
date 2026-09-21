// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Face-anchor editing inside the asset preview modal: mounts the generic
 * click-to-place editor on the preview image, wired to the sprite-context
 * transform endpoints with toast notification.
 */
import { jsonBody, } from "./alpine/json";
import { mountAnchorEditor, } from "./asset-anchor";
import { feFetch, } from "./fe-fetch";
import { anchorFromTransform, } from "./vn/sprite-anchor";

/** Cleanup for the previous preview image's anchor editor (modal is reused). */
let anchorCleanup: (() => void) | null = null;

/**
 * Click-to-place face-anchor editor over the preview image. Prefills from
 * the resolved sprite-context transform; each placement PUTs focalPointX/Y.
 *
 * @param body
 * @param assetId
 */
export function mountPreviewAnchorEditor(body: HTMLElement, assetId: string,): void {
  anchorCleanup?.();
  anchorCleanup = null;
  const img = body.querySelector("img",);
  if (!img) { return; }
  // Marker is absolutely positioned against this container.
  if (body.style.position !== "absolute" && body.style.position !== "relative") {
    body.style.position = "relative";
  }
  anchorCleanup = mountAnchorEditor(img, assetId, {
    load: async (id,) => {
      try {
        const res = await feFetch(`/api/v1/assets/${id}/transform?context=sprite`,);
        if (!res.ok) { return null; }
        return anchorFromTransform(await res.json(),);
      } catch {
        return null;
      }
    },
    save: async (id, point,) => {
      try {
        const res = await feFetch(`/api/v1/assets/${id}/transform`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", },
          body: jsonBody({ context: "sprite", focalPointX: point.x, focalPointY: point.y, },),
        },);
        return res.ok;
      } catch {
        return false;
      }
    },
    notify: (kind, message,) => {
      void import("./ui").then(({ showToast, },) => {
        showToast(kind, message,);
      },).catch(() => undefined);
    },
  },);
}
