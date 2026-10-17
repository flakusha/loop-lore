// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * egui gallery bridge (browser side).
 *
 * The wasm app cannot fetch, decode images, or build multipart forms — those
 * are browser-native operations. This module owns them:
 *
 * - `requestThumbnail(assetId, url)` — fetch thumbnail bytes, decode via
 *   `createImageBitmap` → `OffscreenCanvas` → `getImageData`, then call the
 *   Rust sink `egui_thumb_ready` with raw RGBA pixels.
 * - `uploadAsset()` — open a hidden file input, POST the chosen file as
 *   multipart to `/api/v1/assets`, then call `egui_asset_uploaded`.
 * - `attachAsset(assetId, chatId)` — POST JSON to `/api/v1/assets/:id/links`.
 *
 * Bundled into `egui-bridge.js`; imported by `egui-bridge.ts`.
 */

import { safeJsonStringify, } from "../utils";
import { feFetch, } from "./fe-fetch";

/** Global the Rust glue sinks are installed on (by the /egui host page). */
const GALLERY_SINK_KEY = "loopLoreEguiGallery";

/** The Rust side of the gallery contract (glue named exports). */
export interface EguiGallerySink {
  eguiThumbReady(assetId: string, width: number, height: number, rgba: Uint8ClampedArray,): void;
  eguiThumbFailed(assetId: string,): void;
  eguiAssetUploaded(assetId: string,): void;
  eguiAttachResult(assetId: string, ok: boolean,): void;
}

/** Read the Rust sink if the wasm glue has installed it yet. */
function gallerySink(): EguiGallerySink | null {
  const candidate = (globalThis as Record<string, unknown>)[GALLERY_SINK_KEY];
  if (candidate === undefined || candidate === null) { return null; }
  return candidate as EguiGallerySink;
}

/**
 * Fetch and decode a thumbnail, then deliver raw RGBA to Rust.
 * @param assetId asset the thumbnail belongs to
 * @param url thumbnail URL from the view-model
 */
export async function requestThumbnail(assetId: string, url: string,): Promise<void> {
  try {
    const response = await feFetch(url,);
    if (!response.ok) { throw new Error(`HTTP ${response.status}`,); }
    const blob = await response.blob();
    const bitmap = await createImageBitmap(blob,);
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height,);
    const context = canvas.getContext("2d",);
    if (!context) { throw new Error("no 2d context",); }
    context.drawImage(bitmap, 0, 0,);
    const imageData = context.getImageData(0, 0, bitmap.width, bitmap.height,);
    gallerySink()?.eguiThumbReady(assetId, bitmap.width, bitmap.height, imageData.data,);
  } catch {
    gallerySink()?.eguiThumbFailed(assetId,);
  }
}

/**
 * Open a hidden file input and POST the chosen file to `/api/v1/assets`.
 * Calls `egui_asset_uploaded` with the new asset id (or empty on failure).
 */
export function uploadAsset(): void {
  const input = document.createElement("input",);
  input.type = "file";
  input.accept = "image/*, audio/*, video/*";
  input.style.display = "none";
  input.addEventListener("change", () => {
    const file = input.files?.[0];
    if (!file) { return; }
    void uploadFile(file,).finally(() => input.remove());
  },);

  document.body.appendChild(input,);
  input.click();
}

/**
 * POST the file as multipart to the upload endpoint.
 * @param file the chosen file
 */
async function uploadFile(file: File,): Promise<void> {
  try {
    const formData = new FormData();
    formData.append("file", file,);
    formData.append("alt_text", file.name,);
    const response = await feFetch("/api/v1/assets", {
      method: "POST",
      body: formData,
    },);

    if (!response.ok) { throw new Error(`HTTP ${response.status}`,); }
    const data = await response.json() as { id?: string };
    gallerySink()?.eguiAssetUploaded(data.id ?? "",);
  } catch {
    gallerySink()?.eguiAssetUploaded("",);
  }
}

/**
 * POST an attach link for `assetId` to `chatId`.
 * @param assetId asset to attach
 * @param chatId chat to attach it to
 */
export async function attachAsset(assetId: string, chatId: string,): Promise<void> {
  try {
    const response = await feFetch(`/api/v1/assets/${encodeURIComponent(assetId,)}/links`, {
      method: "POST",
      headers: { "Content-Type": "application/json", },
      body: safeJsonStringify({ entityType: "chat", entityId: chatId, },),
    },);

    if (!response.ok) { throw new Error(`HTTP ${response.status}`,); }
    gallerySink()?.eguiAttachResult(assetId, true,);
  } catch {
    gallerySink()?.eguiAttachResult(assetId, false,);
  }
}

/**
 * Expose the bridge functions for the Rust side: the wasm app calls the
 * globals `requestThumbnail` / `uploadAsset` / `attachAsset`.
 */
export function initEguiGallery(): void {
  (globalThis as Record<string, unknown>).requestThumbnail = requestThumbnail;
  (globalThis as Record<string, unknown>).uploadAsset = uploadAsset;
  (globalThis as Record<string, unknown>).attachAsset = attachAsset;
}

initEguiGallery();
