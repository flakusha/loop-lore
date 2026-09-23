// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Asset Preview Modal — Alpine data factory (TASK-001).
 * Manages the centered modal portal: ESC + backdrop dismiss, focus
 * capture/restore, body-scroll lock, avatar centering via CSS transform.
 */

import { feFetch, } from "../fe-fetch";

export interface PreviewAssetLike {
  id?: string;
  filename?: string;
  name?: string;
  mime_type?: string;
  size_bytes?: number;
  width?: number;
  height?: number;
  alt_text?: string;
  visibility?: string;
  source?: string;
  tags?: string[];
  asset_type?: string;
  type?: string;
  url?: string;
  caption?: string;
}

export interface AssetPreviewModalState {
  isOpen: boolean;
  asset: PreviewAssetLike | null;
  open(asset: PreviewAssetLike, trigger?: HTMLElement | null,): void;
  close(): void;
  formatSize(bytes: number,): string;
}

// ESC dismissal lives in the partial (@keydown.escape.window) — a
// single declarative handler instead of a parallel document listener.
let restoreFocus: HTMLElement | null = null;
let savedOverflow: string | null = null;

/**
 * @param bytes
 */
function formatSize(bytes: number,): string {
  if (bytes == null) { return ""; }
  if (bytes < 1024) { return `${bytes} B`; }
  if (bytes < 1024 * 1024) { return `${(bytes / 1024).toFixed(1,)} KB`; }
  if (bytes < 1024 * 1024 * 1024) { return `${(bytes / 1024 / 1024).toFixed(1,)} MB`; }
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2,)} GB`;
}

/**
 * Open the asset preview modal with focus management.
 *
 * @param asset - the asset payload to display (name/tags/source from existing API).
 * @param trigger - element to restore focus to on close (typically the tile that opened it).
 */
function openImpl(state: AssetPreviewModalState, asset: PreviewAssetLike, trigger?: HTMLElement | null,): void {
  if (!asset) { return; }
  // Capture focus source BEFORE we mutate DOM so ESC can restore it.
  restoreFocus = trigger ?? (document.activeElement as HTMLElement | null);
  state.asset = asset;
  state.isOpen = true;
  // Mirror into the global preview state so the modal's copy/download/delete
  // actions (which read globalThis.__previewAsset) act on THIS asset.
  (globalThis as { __previewAsset?: unknown }).__previewAsset = asset;
  // Body scroll lock — keeps the page from jumping behind the modal.
  if (savedOverflow === null) {
    savedOverflow = document.body.style.overflow;
  }
  document.body.style.overflow = "hidden";
  // Move focus into the modal on next paint.
  requestAnimationFrame(() => {
    const modal = document.querySelector<HTMLElement>("#asset-preview-modal",);
    const first = modal?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    first?.focus();
  },);
}

/**
 * Close the modal: clear payload, release scroll lock, restore focus.
 */
function closeImpl(state: AssetPreviewModalState,): void {
  state.isOpen = false;
  state.asset = null;
  if (savedOverflow !== null) {
    document.body.style.overflow = savedOverflow;
    savedOverflow = null;
  }
  if (restoreFocus && document.contains(restoreFocus,)) {
    restoreFocus.focus();
  }
  restoreFocus = null;
}

/**
 * Asset preview modal data factory.
 */
export function assetPreviewModal(): AssetPreviewModalState {
  const state: AssetPreviewModalState = {
    isOpen: false,
    asset: null,
    formatSize,
    open(asset: PreviewAssetLike, trigger?: HTMLElement | null,) {
      openImpl(this, asset, trigger,);
    },
    close() {
      closeImpl(this,);
    },
  };
  return state;
}

/**
 * Imperative entry point — fetches the asset payload directly and hands
 * it to the Alpine modal. Triggered by tile clicks in the gallery; the
 * legacy chat-sidebar path still goes through `window.openAssetPreview`
 * since that side keeps its own #preview-modal payload.
 */
export async function openAssetPreviewById(id: string,): Promise<void> {
  // Inline fetch — no delegation to the legacy #preview-modal global.
  // Doing both would render two stacked overlays, which the spec
  // explicitly rejects. We fetch the asset payload ourselves, set
  // the preview URL to /raw, and hand it to the Alpine modal state.
  const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  let asset: PreviewAssetLike;
  try {
    // feFetch THROWS on non-OK (and on network failures) — surface
    // those as a toast instead of leaking an unhandled rejection
    // from the tile's click handler.
    const res = await feFetch(`/api/v1/assets/${id}`,);
    asset = (await res.json()) as PreviewAssetLike;
  } catch {
    showToast("error", t("gallery.previewFailed",),);
    return;
  }
  asset.url = `/api/v1/assets/${id}/raw`;
  const modal = document.querySelector<HTMLElement>("#asset-preview-modal",);
  if (modal && typeof Alpine !== "undefined") {
    const state = Alpine.$data(modal,) as unknown as AssetPreviewModalState | undefined;
    state?.open(asset, trigger,);
  }
}

type AssetPreviewModalFactory = typeof assetPreviewModal;
type OpenAssetPreviewById = typeof openAssetPreviewById;
declare global {
  // eslint-disable-next-line no-var
  var assetPreviewModal: AssetPreviewModalFactory;
  // eslint-disable-next-line no-var
  var openAssetPreviewById: OpenAssetPreviewById;
}

(globalThis as unknown as { assetPreviewModal: typeof assetPreviewModal }).assetPreviewModal = assetPreviewModal;
(globalThis as unknown as { openAssetPreviewById: typeof openAssetPreviewById }).openAssetPreviewById =
  openAssetPreviewById;
