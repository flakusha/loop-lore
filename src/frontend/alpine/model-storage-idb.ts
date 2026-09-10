// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * IndexedDB backend for model blobs — thin adapter over `ModelByteStore`.
 * Takes the factory as a parameter so tests can inject a fake; production
 * passes nothing and uses the global.
 *
 * @module alpine/model-storage-idb
 */

import { type ModelByteStore, type StoredModel, sumUsage, } from "./model-storage";

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
  put(value: StoredModel, key: string,): IDBRequestLike<unknown>;
  delete(key: string,): IDBRequestLike<unknown>;
  getAll(): IDBRequestLike<StoredModel[]>;
  createIndex?: (name: string, keyPath: string,) => void;
}

export interface IDBRequestLike<T,> {
  onsuccess: ((event: { target: { result: T } },) => void) | null;
  onerror: ((event: unknown,) => void) | null;
  error: unknown;
  result?: T;
}

/**
 * @param factory - Defaults to global indexedDB.
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
  };
}

/**
 * @param factory
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
 * @param request
 */
function requestToPromise<T,>(request: IDBRequestLike<T>,): Promise<T> {
  const { promise, resolve, reject, } = Promise.withResolvers<T>();
  request.onsuccess = (event,) => resolve(event.target.result,);
  request.onerror = (event,) => reject(request.error ?? event,);
  return promise;
}
