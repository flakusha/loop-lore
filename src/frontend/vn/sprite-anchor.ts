// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * VN sprite anchor — applies per-asset focal metadata (face-anchor) to staged
 * sprite images. Normalized focal (0..1) maps to CSS `object-position`, so the
 * anchor (face/center marker) sits at the slot baseline regardless of framing.
 * Missing anchor clears to the CSS default; fetch failures resolve to null.
 */

/** Normalized face-anchor point in 0..1 image space. */
export interface SpriteAnchor {
  x: number;
  y: number;
}

/** Snake-case transform row as served by GET /api/assets/:id/transform. */
export interface SpriteTransformRow {
  focal_point_x?: number | null;
  focal_point_y?: number | null;
}

/** Fetch a resolved transform row for an asset id (injected for tests). */
export type FetchTransform = (assetId: string,) => Promise<SpriteTransformRow | null>;

/**
 * Extract a usable anchor from a transform row.
 * @param row - Resolved transform row, or null when none exists.
 * @returns Usable anchor, or null when focal data is missing.
 */
export function anchorFromTransform(row: SpriteTransformRow | null | undefined,): SpriteAnchor | null {
  const x = row?.focal_point_x;
  const y = row?.focal_point_y;
  if (typeof x !== "number" || typeof y !== "number") { return null; }
  if (!Number.isFinite(x,) || !Number.isFinite(y,)) { return null; }
  return { x, y, };
}

/**
 * Map an anchor to a CSS object-position value.
 * @param anchor - Normalized anchor point.
 * @returns CSS object-position value.
 */
export function anchorToObjectPosition(anchor: SpriteAnchor,): string {
  return `${anchor.x * 100}% ${anchor.y * 100}%`;
}

/**
 * Apply an anchor to a sprite image (or clear to the CSS default).
 * @param img - Staged sprite image element.
 * @param anchor - Anchor point, or null to clear.
 */
export function applySpriteAnchor(img: HTMLImageElement, anchor: SpriteAnchor | null,): void {
  img.style.objectPosition = anchor ? anchorToObjectPosition(anchor,) : "";
}

/**
 * True for plain asset ids; URL-like refs (http… or /…) carry no fetchable id.
 * Mirrors the URL check in portrait-manager's getPortraitUrl.
 * @param ref - Roster avatar ref.
 * @returns True for plain ids with no URL prefix.
 */
export function isAssetIdRef(ref: string | undefined,): ref is string {
  return !!ref && !ref.startsWith("http",) && !ref.startsWith("/",);
}

/**
 * Default row fetch against the transform endpoint.
 * @param assetId - Asset to resolve.
 * @returns Transform row, or null when missing or unreachable.
 */
async function fetchTransformRow(assetId: string,): Promise<SpriteTransformRow | null> {
  const res = await globalThis.fetch(`/api/assets/${assetId}/transform?context=sprite`,);
  if (!res.ok) { return null; }
  return (await res.json()) as SpriteTransformRow;
}

/**
 * Memoized anchor loader: one fetch per asset id, failures cached as null.
 * @param fetchRow - Row fetcher (defaults to the transform endpoint).
 * @returns Memoized loader resolving anchors per asset id.
 */
export function createAnchorLoader(fetchRow: FetchTransform = fetchTransformRow,) {
  const cache = new Map<string, Promise<SpriteAnchor | null>>();
  return (assetId: string,): Promise<SpriteAnchor | null> => {
    let pending = cache.get(assetId,);
    if (!pending) {
      pending = fetchRow(assetId,).then(anchorFromTransform,).catch(() => null);
      cache.set(assetId, pending,);
    }
    return pending;
  };
}

/**
 * Best-effort anchor pass over staged sprites: fetches each sprite's anchor
 * and applies it to the sprite image. Never rejects — scenes render with
 * CSS defaults when metadata is missing or unreachable.
 * @param stage - Stage element containing `.vn-stage-sprite` nodes.
 * @param load - Memoized anchor loader.
 */
export async function decorateStageAnchors(
  stage: ParentNode,
  load: (assetId: string,) => Promise<SpriteAnchor | null> = createAnchorLoader(),
): Promise<void> {
  const sprites = stage.querySelectorAll<HTMLElement>(".vn-stage-sprite",);
  await Promise.allSettled(
    [...sprites,].map(async (el,) => {
      try {
        const assetId = el.dataset["assetId"];
        if (!isAssetIdRef(assetId,)) { return; }
        const img = el.querySelector("img",);
        if (!img) { return; }
        applySpriteAnchor(img, await load(assetId,),);
      } catch {
        /* ignore — CSS defaults stand in */
      }
    },),
  );
}
