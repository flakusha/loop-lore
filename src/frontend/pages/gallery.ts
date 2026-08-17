// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Gallery page: search, preview, actions ────────────────────
import { log as rootLog, } from "../alpine/logger";
import { feFetch, } from "../fe-fetch";
import { showToast, } from "../ui";
import { escapeHtml, fetchPartial, filterCards, formatSize, } from "./shared";

const pageLog = rootLog.child({ module: "gallery", },);

globalThis.filterAssets = function() {
  const query = document.querySelector<HTMLInputElement>("#asset-search",)?.value ?? "";
  const type = document.querySelector<HTMLSelectElement>("#asset-type-filter",)?.value ?? "all";
  filterCards({
    containerId: "#asset-grid",
    cardSelector: ".asset-card",
    nameSelector: ".name",
    descSelector: ".type",
    query,
    emptyIcon: "📁",
    emptyTitle: "No assets match your filters",
    emptyStyle: "grid-column: 1 / -1;",
    matchExtra: (card,) =>
      type === "all" ||
      (card.querySelector(".file-icon",)?.textContent === "🎵" && type === "audio") ||
      (card.querySelector(".file-icon",)?.textContent === "🎬" && type === "video") ||
      (!!card.querySelector("img",) && type === "image"),
  },);
};

/**
 * Request a signed, time-limited URL for an asset serve action.
 * The generation endpoint returns the URL already carrying `sig`+`expires`,
 * so the caller can use it directly on a plain <a>/<img>/<audio>/<video>
 * without a fresh authenticated session.
 *
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
 * Lazy-mount the asset preview modal into `#modal-container` (the gallery
 * page does not statically include it). Mirrors characters.ts ensureModal.
 *
 * @returns The mounted modal element, or null when it cannot be shown.
 */
async function ensurePreviewModal(): Promise<HTMLElement | null> {
  const existing = document.querySelector<HTMLElement>("#preview-modal",);
  if (existing) { return existing; }

  const container = document.querySelector("#modal-container",);
  if (!container) { return null; }
  const html = await fetchPartial("/partials/gallery/preview-modal",);
  if (!html) { return null; }
  container.innerHTML = html;
  if (globalThis.Alpine) { globalThis.Alpine.initTree(container as HTMLElement,); }
  return document.querySelector<HTMLElement>("#preview-modal",);
}

globalThis.openAssetPreview = async function(id: string,) {
  pageLog.debug("openAssetPreview", { id, },);
  try {
    const res = await feFetch(`/api/assets/${id}`,);
    if (!res.ok) { return; }
    const a = await res.json();
    globalThis.__previewAsset = a;
    const modal = await ensurePreviewModal();
    if (!modal) { return; }
    modal.querySelector("[data-field='filename']",)!.textContent = a.filename || "Asset";
    modal.querySelector("[data-field='mime']",)!.textContent = a.mime_type || "";
    modal.querySelector("[data-field='size']",)!.textContent = formatSize(a.size_bytes,);
    const body = modal.querySelector("[data-field='preview-body']",)!;

    // Media elements render without a fresh session, so back them with a
    // signed `raw` URL (falls back to the direct endpoint on failure).
    let mediaSrc = `/api/assets/${a.id}/raw`;
    if (["image", "audio", "video",].includes(a.asset_type,)) {
      mediaSrc = (await requestSignedUrl(a.id, "raw",)) ?? mediaSrc;
    }

    switch (a.asset_type) {
      case "image": {
        body.innerHTML = `<img src="${mediaSrc}" alt="${escapeHtml(a.filename,)}" style="width:100%;display:block" />`;
        break;
      }
      case "audio": {
        body.innerHTML =
          `<audio controls style="width:100%;padding:var(--space-6)"><source src="${mediaSrc}" /></audio>`;
        break;
      }
      case "video": {
        body.innerHTML = `<video controls style="width:100%;display:block"><source src="${mediaSrc}" /></video>`;
        break;
      }
      default: {
        body.innerHTML =
          `<div style="padding:var(--space-6);text-align:center"><div class="file-icon" style="font-size:48px">📄</div></div>`;
      }
    }
    modal.classList.add("open",);
  } catch {
    /* ignore */
  }
};

globalThis.copyAssetUrl = async function() {
  const a = globalThis.__previewAsset;
  if (!a?.id) { return; }
  try {
    const url = (await requestSignedUrl(a.id, "raw",)) ?? `${location.origin}/api/assets/${a.id}/raw`;
    await navigator.clipboard.writeText(url,);
    showToast("success", "URL copied",);
  } catch {
    showToast("error", "Failed to copy",);
  }
};

globalThis.downloadAsset = async function() {
  const a = globalThis.__previewAsset;
  if (!a?.id) { return; }
  try {
    // Prefer a signed `download` URL (server returns Content-Disposition:
    // attachment). Falls back to the direct endpoint so existing sessions
    // and unconfigured secrets keep working.
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
    showToast("error", "Failed to download",);
  }
};

globalThis.deleteAssetPreview = async function() {
  const a = globalThis.__previewAsset;
  if (!a?.id || !confirm("Delete this asset?",)) { return; }
  try {
    const res = await feFetch(`/api/assets/${a.id}`, { method: "DELETE", },);
    if (res.ok) {
      document.querySelector("#preview-modal",)?.classList.remove("open",);
      globalThis.__previewAsset = null;
      showToast("success", "Asset deleted",);
      const grid = document.querySelector("#asset-grid",);
      if (grid) { htmx.trigger(grid, "load",); }
    }
  } catch {
    showToast("error", "Failed to delete",);
  }
};
