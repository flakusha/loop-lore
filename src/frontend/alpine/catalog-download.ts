// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Catalog entry downloader — fetch every file of a manifest entry with
 * per-file resume, verify-or-record checksums, and aggregated progress.
 *
 * Storage keys are `<model-id>/<file-name>` so entries share the same
 * {@link ModelByteStore} as ad-hoc URL downloads without colliding.
 *
 * GGUF split entries download chunks in assembly order (1..total) and probe
 * the first chunk's magic bytes after the set completes — a wrong or
 * truncated first chunk fails before the entry is treated as ready.
 *
 * @module alpine/catalog-download
 */
import {
  type CatalogModel,
  catalogTotalBytes,
  isGgufMagic,
  isGgufSplitEntry,
  orderSplitFiles,
} from "./model-catalog";
import { downloadModel, type DownloadProgress, sha256Hex, } from "./model-downloader";
import type { ModelByteStore, } from "./model-storage";

/** Options for {@link downloadCatalogEntry}. */
export interface CatalogDownloadDeps {
  entry: CatalogModel;
  store: ModelByteStore;
  download?: typeof downloadModel;
  digest?: typeof sha256Hex;
  signal?: AbortSignal;
  onProgress?: (progress: DownloadProgress,) => void;
}

/** Per-entry download outcome. */
export interface CatalogDownloadResult {
  modelId: string;
  files: string[];
  totalBytes: number;
}

/**
 * Storage key for one catalog file.
 * @param modelId - Catalog entry id.
 * @param fileName - File name within the entry.
 * @returns Namespaced store key.
 */
export function catalogStoreKey(modelId: string, fileName: string,): string {
  return `${modelId}/${fileName}`;
}

/**
 * Download every file of a catalog entry, resuming stored prefixes.
 * @param deps - Entry, store, and seams.
 * @returns Stored keys plus total bytes.
 * @throws When a file URL is not http(s), a split set is incomplete, or a
 * split entry's first chunk fails the GGUF magic probe.
 */
export async function downloadCatalogEntry(deps: CatalogDownloadDeps,): Promise<CatalogDownloadResult> {
  const download = deps.download ?? downloadModel;
  const digest = deps.digest ?? sha256Hex;
  const split = isGgufSplitEntry(deps.entry,);
  const ordered = split ? orderSplitFiles(deps.entry,) : null;
  if (split && !ordered) {
    throw new Error(`Catalog entry "${deps.entry.id}" has an incomplete GGUF split set`,);
  }
  const files = ordered ?? deps.entry.files;
  const knownTotal = catalogTotalBytes(deps.entry,);
  const stored: string[] = [];
  let doneBytes = 0;
  let firstBytes: Uint8Array | null = null;
  for (const file of files) {
    if (!/^https?:\/\//.test(file.url,)) {
      throw new Error(`Catalog file URL is not http(s): ${file.name}`,);
    }
    const key = catalogStoreKey(deps.entry.id, file.name,);
    const prefix = (await deps.store.load(key,))?.bytes;
    const bytes = await download({
      url: file.url,
      expectedSha256: file.sha256,
      sizeBytes: file.sizeBytes,
      resumeFrom: prefix,
      signal: deps.signal,
      onProgress: deps.onProgress
        ? (snapshot,) => {
          deps.onProgress?.({
            loadedBytes: doneBytes + snapshot.loadedBytes,
            totalBytes: knownTotal,
          },);
        }
        : undefined,
    },);
    await deps.store.save(key, {
      bytes,
      sha256: file.sha256 ?? await digest(bytes,),
      updatedAt: Date.now(),
    },);
    if (split && stored.length === 0) { firstBytes = bytes; }
    stored.push(key,);
    doneBytes += bytes.length;
  }
  if (split && !isGgufMagic(firstBytes?.subarray(0, 4,) ?? new Uint8Array(0,),)) {
    throw new Error(`Catalog entry "${deps.entry.id}" failed the GGUF header probe`,);
  }
  return { modelId: deps.entry.id, files: stored, totalBytes: doneBytes, };
}

/**
 * Derive a model id from a file URL's last path segment.
 * @param url - Validated http(s) URL.
 * @returns File name or empty string.
 */
export function filenameFromUrl(url: string,): string {
  const path = url.split("?", 1,)[0] ?? "";
  return path.slice(path.lastIndexOf("/",) + 1,);
}
