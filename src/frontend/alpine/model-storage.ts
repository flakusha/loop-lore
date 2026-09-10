// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Model blob storage — one record per model, shared by the downloader
 * (resume prefixes) and the inference engine (ready blobs).
 *
 * Two backends behind one interface: IndexedDB for production (large,
 * persistent, off the main key-value budget) and an in-memory store for
 * tests and for browsers without IndexedDB. Upgrade path when models grow
 * past single-record comfort: chunk the record value (see epic).
 *
 * @module alpine/model-storage
 */

/** Stored model record. */
export interface StoredModel {
  bytes: Uint8Array;
  /** SHA-256 hex recorded at commit time (empty when unverified). */
  sha256: string;
  updatedAt: number;
}

/** Byte-store contract for model blobs. */
export interface ModelByteStore {
  load(modelId: string,): Promise<StoredModel | null>;
  save(modelId: string, record: StoredModel,): Promise<void>;
  remove(modelId: string,): Promise<number>;
  /** Total stored bytes across all models. */
  usageBytes(): Promise<number>;
}

/**
 * Tot up record sizes.
 * @param records
 */
export function sumUsage(records: Pick<StoredModel, "bytes">[],): number {
  return records.reduce((sum, record,) => sum + record.bytes.length, 0,);
}

/**
 * In-memory store — test seam and no-IndexedDB fallback.
 */
export function createMemoryStore(): ModelByteStore {
  const records = new Map<string, StoredModel>();
  return {
    load: async (modelId,) => records.get(modelId,) ?? null,
    save: async (modelId, record,) => {
      records.set(modelId, record,);
    },
    remove: async (modelId,) => records.delete(modelId,) ? 1 : 0,
    usageBytes: async () => sumUsage([...records.values(),],),
  };
}

/**
 * Whether IndexedDB is usable in this environment.
 */
export function isIndexedDBAvailable(): boolean {
  return typeof indexedDB !== "undefined" && indexedDB !== null;
}
