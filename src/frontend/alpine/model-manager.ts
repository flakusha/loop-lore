// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Model manager UI component — browse the host catalog, download catalog
 * entries file-by-file or GGUF blobs from user-supplied URLs with progress
 * + resume, verify SHA-256, and manage browser storage (list, usage, delete).
 *
 * Catalog entries download through `catalog-download` (per-file resume and
 * verify-or-record checksums); ad-hoc URL downloads go straight through
 * `model-downloader`. Both share the same byte store. Downloads honor the
 * instance policy flag — blocked downloads fail fast with an error.
 *
 * Alpine usage: `x-data="modelManager()"`. All dependencies injectable
 * for tests via {@link createModelManager}. The `modelManager` global is
 * declared in `src/frontend/loaders.d.ts` alongside other page loaders.
 *
 * @module alpine/model-manager
 */

import { downloadCatalogEntry as runCatalogDownload, } from "./catalog-download";
import { detectLocalInferenceSupport, } from "./local-inference";
import { type CatalogModel, fetchCapability, fetchCatalog, type LocalInferenceCapability, } from "./model-catalog";
import { downloadModel, type DownloadProgress, sha256Hex, } from "./model-downloader";
import {
  createMemoryStore,
  isIndexedDBAvailable,
  type ModelByteStore,
  type StoredModelSummary,
} from "./model-storage";
import {
  createIndexedDBStore,
} from "./model-storage-idb";

/** Injectable seams for tests. */
export interface ModelManagerDeps {
  loadCatalog?: () => Promise<CatalogModel[]>;
  store?: ModelByteStore;
  download?: typeof downloadModel;
  digest?: typeof sha256Hex;
  loadCapability?: () => Promise<LocalInferenceCapability>;
}

/** Reactive state + actions for the model manager component. */
export interface ModelManagerState {
  catalog: CatalogModel[];
  stored: StoredModelSummary[];
  usageBytes: number;
  loading: boolean;
  error: string | null;
  catalogError: string | null;
  downloadingId: string | null;
  progress: DownloadProgress | null;
  downloadUrl: string;
  downloadSha: string;
  downloadId: string;
  webgpu: boolean;
  indexedDB: boolean;
  downloadsAllowed: boolean;
  init(): Promise<void>;
  refresh(): Promise<void>;
  downloadFromUrl(): Promise<void>;
  downloadCatalogEntry(modelId: string,): Promise<void>;
  storedFiles(modelId: string,): number;
  cancelDownload(): void;
  removeModel(modelId: string,): Promise<void>;
  formatSize(bytes: number,): string;
}

let defaultStore: ModelByteStore | null = null;

/**
 * Shared store singleton for the live component.
 * @returns The default model byte store.
 */
function defaultStoreInstance(): ModelByteStore {
  defaultStore ??= isIndexedDBAvailable() ? createIndexedDBStore() : createMemoryStore();
  return defaultStore;
}

/**
 * Create the model manager component state.
 * @param deps - Injectable seams for tests.
 * @returns Alpine-compatible component state.
 */
export function createModelManager(deps: ModelManagerDeps = {},): ModelManagerState {
  const loadCatalog = deps.loadCatalog ?? fetchCatalog;
  const loadCapability = deps.loadCapability ?? fetchCapability;
  const digest = deps.digest ?? sha256Hex;
  const download = deps.download ?? downloadModel;
  let controller: AbortController | null = null;

  const state: ModelManagerState = {
    catalog: [],
    stored: [],
    usageBytes: 0,
    loading: false,
    error: null,
    catalogError: null,
    downloadingId: null,
    progress: null,
    downloadUrl: "",
    downloadSha: "",
    downloadId: "",
    webgpu: false,
    indexedDB: false,
    downloadsAllowed: true,

    async init(): Promise<void> {
      const support = detectLocalInferenceSupport();
      this.webgpu = support.webgpu;
      this.indexedDB = isIndexedDBAvailable();
      await this.refresh();
      try {
        this.downloadsAllowed = (await loadCapability()).downloadsAllowed;
      } catch {
        /* capability unreachable — fail open, the manifest stays fail-closed */
      }
      try {
        this.catalog = await loadCatalog();
      } catch {
        this.catalogError = "Model catalog unavailable — direct URL download still works.";
      }
    },

    async refresh(): Promise<void> {
      this.loading = true;
      try {
        const store = deps.store ?? defaultStoreInstance();
        this.stored = await store.list();
        this.usageBytes = await store.usageBytes();
      } finally {
        this.loading = false;
      }
    },

    async downloadFromUrl(): Promise<void> {
      if (!this.downloadsAllowed) {
        this.error = "Model downloads are disabled on this instance.";
        return;
      }
      const url = this.downloadUrl.trim();
      if (!/^https?:\/\//.test(url,)) {
        this.error = "Enter an http(s) model file URL.";
        return;
      }
      const modelId = this.downloadId.trim() || filenameFromUrl(url,);
      if (!modelId) {
        this.error = "Could not derive a model name — enter one explicitly.";
        return;
      }
      const store = deps.store ?? defaultStoreInstance();
      this.error = null;
      this.downloadingId = modelId;
      this.progress = { loadedBytes: 0, totalBytes: undefined, };
      controller = new AbortController();
      try {
        const prefix = (await store.load(modelId,))?.bytes;
        const expected = this.downloadSha.trim() || undefined;
        const bytes = await download({
          url,
          expectedSha256: expected,
          resumeFrom: prefix,
          signal: controller.signal,
          onProgress: (snapshot,) => {
            this.progress = snapshot;
          },
        },);
        await store.save(modelId, {
          bytes,
          sha256: expected ?? await digest(bytes,),
          updatedAt: Date.now(),
        },);
        this.downloadUrl = "";
        this.downloadSha = "";
        this.downloadId = "";
        await this.refresh();
      } catch (cause) {
        this.error = cause instanceof Error ? cause.message : "Download failed.";
      } finally {
        controller = null;
        this.downloadingId = null;
        this.progress = null;
      }
    },

    async downloadCatalogEntry(modelId: string,): Promise<void> {
      if (!this.downloadsAllowed) {
        this.error = "Model downloads are disabled on this instance.";
        return;
      }
      const entry = this.catalog.find((item,) => item.id === modelId);
      if (!entry) {
        this.error = "Catalog entry is no longer listed.";
        return;
      }
      const store = deps.store ?? defaultStoreInstance();
      this.error = null;
      this.downloadingId = modelId;
      this.progress = { loadedBytes: 0, totalBytes: undefined, };
      controller = new AbortController();
      try {
        await runCatalogDownload({
          entry,
          store,
          download,
          digest,
          signal: controller.signal,
          onProgress: (snapshot,) => {
            this.progress = snapshot;
          },
        },);
        await this.refresh();
      } catch (cause) {
        this.error = cause instanceof Error ? cause.message : "Download failed.";
      } finally {
        controller = null;
        this.downloadingId = null;
        this.progress = null;
      }
    },

    storedFiles(modelId: string,): number {
      const prefix = `${modelId}/`;
      return this.stored.filter((entry,) => entry.id.startsWith(prefix,)).length;
    },

    cancelDownload(): void {
      controller?.abort();
    },

    async removeModel(modelId: string,): Promise<void> {
      const store = deps.store ?? defaultStoreInstance();
      await store.remove(modelId,);
      await this.refresh();
    },

    formatSize(bytes: number,): string {
      if (bytes < 1024) { return `${bytes} B`; }
      if (bytes < 1_048_576) { return `${(bytes / 1024).toFixed(1,)} KB`; }
      if (bytes < 1_073_741_824) { return `${(bytes / 1_048_576).toFixed(1,)} MB`; }
      return `${(bytes / 1_073_741_824).toFixed(2,)} GB`;
    },
  };
  return state;
}

/**
 * Derive a model id from a file URL's last path segment.
 * @param url - Validated http(s) URL.
 * @returns File name or empty string.
 */
function filenameFromUrl(url: string,): string {
  const path = url.split("?", 1,)[0] ?? "";
  return path.slice(path.lastIndexOf("/",) + 1,);
}

globalThis.modelManager = function(): ModelManagerState {
  return createModelManager();
};
