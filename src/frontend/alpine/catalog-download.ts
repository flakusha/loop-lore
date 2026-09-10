// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Catalog entry downloader — fetch every file of a manifest entry with
 * per-file resume, verify-or-record checksums, and aggregated progress.
 *
 * Storage keys are `<model-id>/<file-name>` so entries share the same
 * {@link ModelByteStore} as ad-hoc URL downloads without colliding.
 *
 * @module alpine/catalog-download
 */
import { type CatalogModel, catalogTotalBytes, } from "./model-catalog";
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
 * @throws When a file URL is not http(s) or a download fails.
 */
export async function downloadCatalogEntry(deps: CatalogDownloadDeps,): Promise<CatalogDownloadResult> {
  const download = deps.download ?? downloadModel;
  const digest = deps.digest ?? sha256Hex;
  const knownTotal = catalogTotalBytes(deps.entry,);
  const files: string[] = [];
  let doneBytes = 0;
  for (const file of deps.entry.files) {
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
    files.push(key,);
    doneBytes += bytes.length;
  }
  return { modelId: deps.entry.id, files, totalBytes: doneBytes, };
}
