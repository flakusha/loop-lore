// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Globally-available asset preview handler.
 *
 * Gallery grid cards reference this via `onclick="openAssetPreview('id')"`.
 * Loading it from the core bundle (alpine-init.ts) ensures the function is
 * defined for every page, including embedded contexts (chat panel, world
 * detail) that do not load pages.js.
 */

import { feFetch, } from "./fe-fetch";

interface PreviewAsset {
  id: string;
  filename?: string;
  mime_type?: string;
  size_bytes?: number;
  asset_type?: string;
}

declare global {
  // eslint-disable-next-line no-var
  var __previewAsset: PreviewAsset | null | undefined;
}

/** Lazily mount the preview modal into `#modal-container`. */
async function ensurePreviewModal(): Promise<HTMLElement | null> {
  const existing = document.querySelector<HTMLElement>("#preview-modal",);
  if (existing) { return existing; }
  const container = document.querySelector("#modal-container",);
  if (!container) { return null; }
  const res = await fetch("/partials/gallery/preview-modal",);
  if (!res.ok) { return null; }
  container.innerHTML = await res.text();
  if (globalThis.Alpine) {
    (globalThis.Alpine as { initTree(el: HTMLElement): void }).initTree(container as HTMLElement,);
  }
  return document.querySelector<HTMLElement>("#preview-modal",);
}

function formatSize(bytes: number): string {
  if (bytes < 1024) { return `${bytes} B`; }
  if (bytes < 1_048_576) { return `${(bytes / 1024).toFixed(1,)} KB`; }
  return `${(bytes / 1_048_576).toFixed(1,)} MB`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c,) => {
    switch (c) {
      case "&": return "&amp;";
      case "<": return "&lt;";
      case ">": return "&gt;";
      case '"': return "&quot;";
      case "'": return "&#39;";
      default: return c;
    }
  },);
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
    const body = modal.querySelector("[data-field='preview-body']",)!;
    const mediaSrc = `/api/assets/${a.id}/raw`;
    switch (a.asset_type) {
      case "image": {
        body.innerHTML = `<img src="${mediaSrc}" alt="${escapeHtml(a.filename ?? "")}" style="width:100%;display:block" />`;
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
    /* ignore — preview is best-effort */
  }
};

export {};
