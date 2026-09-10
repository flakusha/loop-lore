// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Model manager UI component — browse the host catalog, download GGUF
 * blobs from user-supplied URLs with progress + resume, verify SHA-256,
 * and manage browser storage (list, usage, delete).
 *
 * Division of labor: the transformers.js catalog models are fetched lazily
 * by the inference engine at runtime, not by this downloader. This manager
 * handles explicit blob downloads (future WASM GGUF engine) and storage
 * visibility. Catalog entries without file URLs cannot be direct-downloaded
 * until the manifest carries per-file checksums (manifest v2).
 *
 * Alpine usage: `x-data="modelManager()"`. All dependencies injectable
 * for tests via {@link createModelManager}. The `modelManager` global is
 * declared in `src/frontend/loaders.d.ts` alongside other page loaders.
 *
 * @module alpine/model-manager
 */

import { apiFetch, } from "./htmx";
import { detectLocalInferenceSupport, } from "./local-inference";
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

/** Catalog entry as served by GET /api/local-inference/manifest. */
export interface CatalogModel {
  id: string;
  label: string;
  engine: string;
  parameters: string;
  approxSizeMB: number;
  cdn: string;
}

/** Injectable seams for tests. */
export interface ModelManagerDeps {
  loadCatalog?: () => Promise<CatalogModel[]>;
  store?: ModelByteStore;
  download?: typeof downloadModel;
  digest?: typeof sha256Hex;
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
  init(): Promise<void>;
  refresh(): Promise<void>;
  downloadFromUrl(): Promise<void>;
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
 * Fetch catalog models from the static manifest endpoint.
 * @returns Manifest catalog models (empty when the shape is unknown).
 */
async function fetchCatalog(): Promise<CatalogModel[]> {
  const res = await apiFetch("/api/local-inference/manifest",);
  if (!res.ok) { throw new Error(`Manifest request failed (${res.status})`,); }
  const payload: unknown = await res.json();
  if (payload && typeof payload === "object" && "models" in payload) {
    const models: unknown = payload.models;
    if (Array.isArray(models,) && models.every(isCatalogModel,)) {
      return models;
    }
  }
  return [];
}

/**
 * Narrow an unknown manifest entry to a catalog model.
 * @param entry - Raw manifest entry.
 * @returns True when the entry has the catalog shape.
 */
function isCatalogModel(entry: unknown,): entry is CatalogModel {
  if (!entry || typeof entry !== "object") { return false; }
  return "id" in entry && typeof entry.id === "string" &&
    "label" in entry && typeof entry.label === "string" &&
    "engine" in entry && typeof entry.engine === "string" &&
    "parameters" in entry && typeof entry.parameters === "string" &&
    "approxSizeMB" in entry && typeof entry.approxSizeMB === "number" &&
    "cdn" in entry && typeof entry.cdn === "string";
}

/**
 * Create the model manager component state.
 * @param deps - Injectable seams for tests.
 * @returns Alpine-compatible component state.
 */
export function createModelManager(deps: ModelManagerDeps = {},): ModelManagerState {
  const loadCatalog = deps.loadCatalog ?? fetchCatalog;
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

    async init(): Promise<void> {
      const support = detectLocalInferenceSupport();
      this.webgpu = support.webgpu;
      this.indexedDB = isIndexedDBAvailable();
      await this.refresh();
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
