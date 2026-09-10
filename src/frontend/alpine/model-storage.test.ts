// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * model-storage: memory store semantics and the IndexedDB adapter against
 * a Map-backed fake factory (bun has no IndexedDB).
 */

import { describe, expect, test, } from "bun:test";
import {
  createMemoryStore,
  isIndexedDBAvailable,
  type StoredModel,
  sumUsage,
} from "./model-storage";
import {
  createIndexedDBStore,
  type IDBDatabaseLike,
  type IDBFactoryLike,
  type IDBObjectStoreLike,
  type IDBOpenDBRequestLike,
  type IDBRequestLike,
} from "./model-storage-idb";

const record = (text: string,): StoredModel => ({
  bytes: new TextEncoder().encode(text,),
  sha256: "hash",
  updatedAt: 1,
});

/** Minimal Map-backed IDB fake — fires upgrade then success asynchronously. */
function createFakeFactory(data: Map<string, StoredModel>,): IDBFactoryLike {
  const makeRequest = <T,>(result: T,): IDBRequestLike<T> => {
    const request = {
      onsuccess: null,
      onerror: null,
      error: undefined,
    } as unknown as IDBRequestLike<T>;
    queueMicrotask(() => request.onsuccess?.({ target: { result, }, },));
    return request;
  };
  const objectStore = (): IDBObjectStoreLike => ({
    get: (key,) => makeRequest(data.get(key,),),
    put: (value, key,) => {
      data.set(key, value,);
      return makeRequest<unknown>(undefined,);
    },
    delete: (key,) => {
      data.delete(key,);
      return makeRequest<unknown>(undefined,);
    },
    getAll: () => makeRequest([...data.values(),],),
    getAllKeys: () => makeRequest([...data.keys(),],),
  });
  const database = {
    transaction: () => ({ objectStore: () => objectStore(), }),
    close: () => {},
    createObjectStore: () => objectStore(),
  } as unknown as IDBDatabaseLike & { createObjectStore(name: string,): IDBObjectStoreLike };
  return {
    open: () => {
      const request = {
        onupgradeneeded: null,
        onsuccess: null,
        onerror: null,
        error: undefined,
      } as unknown as IDBOpenDBRequestLike;
      queueMicrotask(() => {
        request.onupgradeneeded?.({ target: { result: database, }, },);
        request.onsuccess?.({ target: { result: database, }, },);
      },);
      return request;
    },
  };
}

async function expectStoreSemantics(label: string, make: () => ReturnType<typeof createMemoryStore>,): Promise<void> {
  const store = make();
  await store.save("m1", record("ab",),);
  await store.save("m2", record("cdef",),);
  expect(new TextDecoder().decode((await store.load("m1",))?.bytes,),).toBe("ab",);
  expect(await store.load("missing",),).toBeNull();
  expect(await store.usageBytes(),).toBe(6,);
  const listed = await store.list();
  expect(listed.map((entry,) => entry.id).sort(),).toEqual(["m1", "m2",],);
  expect(listed.find((entry,) => entry.id === "m2")?.sizeBytes,).toBe(4,);
  expect(listed.find((entry,) => entry.id === "m2")?.sha256,).toBe("hash",);
  expect(await store.remove("m1",),).toBe(1,);
  expect(await store.remove("m1",),).toBe(0,);
  expect(await store.load("m1",),).toBeNull();
  expect(await store.usageBytes(),).toBe(4,);
  expect((await store.list()).map((entry,) => entry.id),).toEqual(["m2",],);
  void label;
}

describe("model-storage", () => {
  test("memory store round-trips, accounts, lists, and removes", async () => {
    await expectStoreSemantics("memory", createMemoryStore,);
  });

  test("IndexedDB adapter round-trips over the fake factory", async () => {
    const data = new Map<string, StoredModel>();
    await expectStoreSemantics("idb", () => createIndexedDBStore(createFakeFactory(data,),),);
    expect(data.has("m2",),).toBe(true,);
  });

  test("sumUsage tots record sizes", () => {
    expect(sumUsage([record("ab",), record("cde",),],),).toBe(5,);
    expect(sumUsage([],),).toBe(0,);
  });

  test("IndexedDB is unavailable under bun", () => {
    expect(isIndexedDBAvailable(),).toBe(false,);
  });
});
