// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * IndexedDB backend for model blobs — thin adapter over `ModelByteStore`.
 * Takes the factory as a parameter so tests can inject a fake; production
 * passes nothing and uses the global.
 *
 * @module alpine/model-storage-idb
 */

import {
  createMemoryStore,
  isIndexedDBAvailable,
  type ModelByteStore,
  type StoredModel,
  summarizeRecords,
  sumUsage,
} from "./model-storage";

const DB_NAME = "loop-lore-models";
const STORE_NAME = "models";

/**
 * Minimal IDB surface this adapter needs (satisfied by the real
 * IDBFactory and by the test fake).
 */
export interface IDBFactoryLike {
  open(name: string, version: number,): IDBOpenDBRequestLike;
}

export interface IDBOpenDBRequestLike {
  onupgradeneeded: ((event: { target: { result: IDBDatabaseLike } },) => void) | null;
  onsuccess: ((event: { target: { result: IDBDatabaseLike } },) => void) | null;
  onerror: ((event: unknown,) => void) | null;
  error: unknown;
}

export interface IDBDatabaseLike {
  transaction(store: string, mode: IDBTransactionMode,): IDBTransactionLike;
  close(): void;
}

export interface IDBTransactionLike {
  objectStore(name: string,): IDBObjectStoreLike;
}

export interface IDBObjectStoreLike {
  get(key: string,): IDBRequestLike<StoredModel | undefined>;
  getAll(): IDBRequestLike<StoredModel[]>;
  getAllKeys(): IDBRequestLike<string[]>;
  put(value: StoredModel, key: string,): IDBRequestLike<unknown>;
  delete(key: string,): IDBRequestLike<unknown>;
  createIndex?: (name: string, keyPath: string,) => void;
}

export interface IDBRequestLike<T,> {
  onsuccess: ((event: { target: { result: T } },) => void) | null;
  onerror: ((event: unknown,) => void) | null;
  error: unknown;
  result?: T;
}

/**
 * Create an IndexedDB-backed model byte store.
 * @param factory - Defaults to global indexedDB.
 * @returns Model byte store persisted in IndexedDB.
 */
export function createIndexedDBStore(factory?: IDBFactoryLike,): ModelByteStore {
  const idb = factory ?? (indexedDB as unknown as IDBFactoryLike);
  let dbPromise: Promise<IDBDatabaseLike> | null = null;

  const db = (): Promise<IDBDatabaseLike> => {
    dbPromise ??= openDatabase(idb,);
    return dbPromise;
  };
  const store = async (mode: IDBTransactionMode,): Promise<IDBObjectStoreLike> => {
    const database = await db();
    return database.transaction(STORE_NAME, mode,).objectStore(STORE_NAME,);
  };

  return {
    load: async (modelId,) => {
      const objectStore = await store("readonly",);
      const record = await requestToPromise(objectStore.get(modelId,),);
      return record ?? null;
    },
    save: async (modelId, record,) => {
      const objectStore = await store("readwrite",);
      await requestToPromise(objectStore.put(record, modelId,),);
    },
    remove: async (modelId,) => {
      const objectStore = await store("readwrite",);
      const existing = await requestToPromise(objectStore.get(modelId,),);
      if (!existing) { return 0; }
      await requestToPromise(objectStore.delete(modelId,),);
      return 1;
    },
    usageBytes: async () => {
      const objectStore = await store("readonly",);
      const records = await requestToPromise(objectStore.getAll(),);
      return sumUsage(records,);
    },
    list: async () => {
      const objectStore = await store("readonly",);
      const keys = await requestToPromise(objectStore.getAllKeys(),);
      const entries: [id: string, record: StoredModel,][] = [];
      for (const key of keys) {
        const record = await requestToPromise(objectStore.get(key,),);
        if (record) { entries.push([key, record,],); }
      }
      return summarizeRecords(entries,);
    },
  };
}

/**
 * Open (or create) the model database.
 * @param factory - IDB factory to open with.
 * @returns Open database handle.
 */
function openDatabase(factory: IDBFactoryLike,): Promise<IDBDatabaseLike> {
  const { promise, resolve, reject, } = Promise.withResolvers<IDBDatabaseLike>();
  const request = factory.open(DB_NAME, 1,);
  request.onupgradeneeded = (event,) => {
    const database = event.target.result as IDBDatabaseLike & {
      createObjectStore(name: string,): IDBObjectStoreLike;
    };
    const objectStore = database.createObjectStore(STORE_NAME,);
    objectStore.createIndex?.("by-updated", "updatedAt",);
  };
  request.onsuccess = (event,) => resolve(event.target.result,);
  request.onerror = (event,) => reject(request.error ?? event,);
  return promise;
}

/**
 * Await an IDB request.
 * @param request - Request to await.
 * @returns Request result.
 */
function requestToPromise<T,>(request: IDBRequestLike<T>,): Promise<T> {
  const { promise, resolve, reject, } = Promise.withResolvers<T>();
  request.onsuccess = (event,) => resolve(event.target.result,);
  request.onerror = (event,) => reject(request.error ?? event,);
  return promise;
}

let defaultStore: ModelByteStore | null = null;

/**
 * Shared default byte store for the live component.
 * @returns IndexedDB-backed store when available, memory store otherwise.
 */
export function defaultModelStore(): ModelByteStore {
  defaultStore ??= isIndexedDBAvailable() ? createIndexedDBStore() : createMemoryStore();
  return defaultStore;
}
