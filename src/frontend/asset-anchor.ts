// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Face-anchor editor for the asset preview modal.
 *
 * Click-to-place marker over the preview image: the marker position is the
 * per-image anchor (prefilled from the resolved transform — seed-backed when
 * untouched), persisted to the sprite context on every placement. Manual
 * placement always wins; no automatic detector exists yet.
 */

/** Normalized anchor point in 0..1 image space. */
export interface AnchorPoint {
  x: number;
  y: number;
}

/** Transport + notification seams (injected for tests). */
export interface AnchorEditorDeps {
  load: (assetId: string,) => Promise<AnchorPoint | null>;
  save: (assetId: string, point: AnchorPoint,) => Promise<boolean>;
  notify: (kind: "success" | "error", message: string,) => void;
}

/**
 * Clamp raw offsets to a normalized 0..1 point.
 * @param width - Image width in pixels.
 * @param height - Image height in pixels.
 * @param offsetX - Click offset from the image left edge.
 * @param offsetY - Click offset from the image top edge.
 * @returns Normalized anchor point.
 */
export function normalizePoint(width: number, height: number, offsetX: number, offsetY: number,): AnchorPoint {
  const clamp = (v: number,): number => Math.min(1, Math.max(0, v,),);
  return {
    x: width > 0 ? clamp(offsetX / width,) : 0.5,
    y: height > 0 ? clamp(offsetY / height,) : 0.5,
  };
}

function makeMarker(): HTMLElement {
  const marker = document.createElement("div",);
  marker.className = "asset-anchor-marker";
  marker.setAttribute("aria-hidden", "true",);
  marker.style.position = "absolute";
  marker.style.width = "18px";
  marker.style.height = "18px";
  marker.style.margin = "-9px 0 0 -9px";
  marker.style.border = "2px solid var(--accent, #7c5cff)";
  marker.style.borderRadius = "50%";
  marker.style.pointerEvents = "none";
  return marker;
}

function placeMarker(marker: HTMLElement, point: AnchorPoint,): void {
  marker.style.left = `${point.x * 100}%`;
  marker.style.top = `${point.y * 100}%`;
}

/**
 * Mount click-to-place anchor editing on a preview image.
 * @param img - Preview image element.
 * @param assetId - Asset the anchor belongs to.
 * @param deps - Transport + notification seams.
 * @returns Teardown removing the listener and marker.
 */
export function mountAnchorEditor(img: HTMLImageElement, assetId: string, deps: AnchorEditorDeps,): () => void {
  const parent = img.parentElement;
  if (!parent) { return () => undefined; }
  if (!parent.style.position) { parent.style.position = "relative"; }
  const marker = makeMarker();
  parent.append(marker,);

  deps.load(assetId,).then((point,) => {
    if (point) { placeMarker(marker, point,); }
  },).catch(() => undefined);

  const onClick = (ev: MouseEvent,): void => {
    const rect = img.getBoundingClientRect();
    const point = normalizePoint(rect.width, rect.height, ev.clientX - rect.left, ev.clientY - rect.top,);
    placeMarker(marker, point,);
    deps.save(assetId, point,).then((ok,) => {
      deps.notify(ok ? "success" : "error", ok ? "Anchor saved" : "Failed to save anchor",);
    },).catch(() => {
      deps.notify("error", "Failed to save anchor",);
    },);
  };
  img.addEventListener("click", onClick,);
  return () => {
    img.removeEventListener("click", onClick,);
    marker.remove();
  };
}
