// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Globally-available asset preview: modal mounting, media rendering, and the
 * copy-url / download / delete actions the preview modals reference.
 *
 * This is the SINGLE implementation of `openAssetPreview` (plus its action
 * helpers). It ships in the core bundle (alpine-init.ts) so every page —
 * gallery, chat panel, world detail — gets identical behavior. Do not
 * re-define these globals elsewhere.
 */

import { safeFetch, } from "../utils";
import { feFetch, } from "./fe-fetch";

interface PreviewAsset {
  id: string;
  filename?: string;
  mime_type?: string;
  size_bytes?: number;
  asset_type?: string;
}

declare global {
  var __previewAsset: PreviewAsset | null | undefined;

  var openAssetPreview: ((id: string,) => Promise<void>) | undefined;

  var copyAssetUrl: (() => Promise<void>) | undefined;

  var downloadAsset: (() => Promise<void>) | undefined;

  var deleteAssetPreview: (() => Promise<void>) | undefined;
}

/**
 * @param bytes
 */
function formatSize(bytes: number,): string {
  if (bytes < 1024) { return `${bytes} B`; }
  if (bytes < 1_048_576) { return `${(bytes / 1024).toFixed(1,)} KB`; }
  return `${(bytes / 1_048_576).toFixed(1,)} MB`;
}

/**
 * @param s
 */
function escapeHtml(s: string,): string {
  return s.replace(/[&<>"']/g, (c,) => {
    switch (c) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return c;
    }
  },);
}

/** Lazily mount the preview modal into `#modal-container`. */
async function ensurePreviewModal(): Promise<HTMLElement | null> {
  const existing = document.querySelector<HTMLElement>("#preview-modal",);
  if (existing) { return existing; }
  const container = document.querySelector("#modal-container",);
  if (!container) { return null; }
  const result = await safeFetch<string>("/partials/gallery/preview-modal", { parseJson: false, },);
  if (!result.ok) { return null; }
  container.innerHTML = result.data as string;
  if (globalThis.Alpine) {
    (globalThis.Alpine as { initTree(el: HTMLElement,): void }).initTree(container as HTMLElement,);
  }
  return document.querySelector<HTMLElement>("#preview-modal",);
}

/**
 * Request a signed, time-limited URL for an asset serve action so
 * <img>/<audio>/<video> elements work without a fresh authenticated session.
 * @param assetId
 * @param action
 * @returns The absolute signed URL, or null when generation/access is denied.
 */
async function requestSignedUrl(assetId: string, action: string,): Promise<string | null> {
  try {
    const res = await feFetch(`/api/assets/${assetId}/signed-url/${action}`, { method: "POST", },);
    if (!res.ok) { return null; }
    const data = await res.json();
    return typeof data?.url === "string" ? `${location.origin}${data.url}` : null;
  } catch {
    return null;
  }
}

/**
 * @param body
 * @param a
 */
async function renderPreviewBody(
  body: HTMLElement,
  a: PreviewAsset,
): Promise<void> {
  let mediaSrc = `/api/assets/${a.id}/raw`;
  if (a.asset_type && ["image", "audio", "video",].includes(a.asset_type,)) {
    mediaSrc = (await requestSignedUrl(a.id, "raw",)) ?? mediaSrc;
  }

  switch (a.asset_type) {
    case "image": {
      body.innerHTML = `<img src="${escapeHtml(mediaSrc,)}" alt="${
        escapeHtml(a.filename ?? "",)
      }" style="width:100%;display:block" />`;
      break;
    }
    case "audio": {
      body.innerHTML = `<audio controls style="width:100%;padding:var(--space-6)"><source src="${
        escapeHtml(mediaSrc,)
      }" /></audio>`;
      break;
    }
    case "video": {
      body.innerHTML = `<video controls style="width:100%;display:block"><source src="${
        escapeHtml(mediaSrc,)
      }" /></video>`;
      break;
    }
    default: {
      body.innerHTML =
        `<div style="padding:var(--space-6);text-align:center"><div class="file-icon" style="font-size:48px">📄</div></div>`;
    }
  }
}

globalThis.openAssetPreview = async function openAssetPreview(id: string,): Promise<void> {
  try {
    const res = await feFetch(`/api/assets/${id}`,);
    if (!res.ok) { return; }
    const a = (await res.json()) as PreviewAsset;
    globalThis.__previewAsset = a;
    const modal = await ensurePreviewModal();
    if (!modal) { return; }
    modal.querySelector("[data-field='filename']",)!.textContent = a.filename || "Asset";
    modal.querySelector("[data-field='mime']",)!.textContent = a.mime_type || "";
    modal.querySelector("[data-field='size']",)!.textContent = formatSize(a.size_bytes ?? 0,);
    const body = modal.querySelector<HTMLElement>("[data-field='preview-body']",)!;
    await renderPreviewBody(body, a,);
    modal.classList.add("open",);
  } catch {
    /* ignore — preview is best-effort */
  }
};

globalThis.copyAssetUrl = async function copyAssetUrl(): Promise<void> {
  const a = globalThis.__previewAsset;
  if (!a?.id) { return; }
  try {
    const url = (await requestSignedUrl(a.id, "raw",)) ?? `${location.origin}/api/assets/${a.id}/raw`;
    await navigator.clipboard.writeText(url,);
    const { showToast, } = await import("./ui");
    showToast("success", "URL copied",);
  } catch {
    const { showToast, } = await import("./ui");
    showToast("error", "Failed to copy",);
  }
};

globalThis.downloadAsset = async function downloadAsset(): Promise<void> {
  const a = globalThis.__previewAsset;
  if (!a?.id) { return; }
  try {
    // Prefer a signed `download` URL (server forces Content-Disposition:
    // attachment). Falls back to the direct endpoint for existing sessions.
    const url = (await requestSignedUrl(a.id, "download",)) ?? `/api/assets/${a.id}/download`;
    const el = document.createElement("a",);
    el.href = url;
    el.download = a.filename || "asset";
    // Append to the DOM before clicking: a detached anchor's click may not
    // initiate the download navigation in all Chromium contexts.
    el.style.display = "none";
    document.body.append(el,);
    el.click();
    el.remove();
  } catch {
    const { showToast, } = await import("./ui");
    showToast("error", "Failed to download",);
  }
};

globalThis.deleteAssetPreview = async function deleteAssetPreview(): Promise<void> {
  const a = globalThis.__previewAsset;
  if (!a?.id || !confirm("Delete this asset?",)) { return; }
  const { showToast, } = await import("./ui");
  try {
    const res = await feFetch(`/api/assets/${a.id}`, { method: "DELETE", },);
    if (res.ok) {
      document.querySelector("#preview-modal",)?.classList.remove("open",);
      globalThis.__previewAsset = null;
      showToast("success", "Asset deleted",);
      const grid = document.querySelector("#asset-grid",);
      if (grid) {
        (globalThis.htmx as { trigger(el: HTMLElement, evt: string,): void }).trigger(grid as HTMLElement, "load",);
      }
    }
  } catch {
    showToast("error", "Failed to delete",);
  }
};

export {};
