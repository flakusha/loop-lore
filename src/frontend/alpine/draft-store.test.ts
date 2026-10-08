// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Generic keyed draft store — framework-agnostic persistence primitive
 * shared by the composer and other text surfaces.
 */
import { describe, expect, test, } from "bun:test";
import { createKeyedDraftStore, type DraftStore, } from "./draft-store";

function memStore(): DraftStore {
  const data = new Map<string, string>();
  return {
    getItem: (key,) => data.get(key,) ?? null,
    setItem: (key, value,) => {
      data.set(key, value,);
    },
    removeItem: (key,) => {
      data.delete(key,);
    },
  };
}

const PREFIX = "test:draft:";
const INDEX_KEY = "test:drafts:index";

describe("createKeyedDraftStore", () => {
  test("write/read/clear round-trips with a custom prefix", () => {
    const store = memStore();
    const drafts = createKeyedDraftStore({ prefix: PREFIX, indexKey: INDEX_KEY, storage: store, },);
    expect(drafts.key("a",),).toBe("test:draft:a",);

    drafts.write("a", "hello",);
    expect(drafts.read("a",)?.text,).toBe("hello",);
    expect(drafts.readIndex(),).toEqual(["a",],);

    drafts.clear("a",);
    expect(drafts.read("a",),).toBeNull();
    expect(drafts.readIndex(),).toEqual([],);
  });

  test("evicts LRU entries past maxEntries", () => {
    const store = memStore();
    const drafts = createKeyedDraftStore({ prefix: PREFIX, indexKey: INDEX_KEY, maxEntries: 2, storage: store, },);

    drafts.write("a", "one",);
    drafts.write("b", "two",);
    drafts.write("c", "three",);

    expect(drafts.readIndex(),).toEqual(["c", "b",],);
    expect(drafts.read("a",),).toBeNull();
    expect(drafts.read("b",)?.text,).toBe("two",);
  });

  test("blank text removes the entry", () => {
    const store = memStore();
    const drafts = createKeyedDraftStore({ prefix: PREFIX, indexKey: INDEX_KEY, storage: store, },);

    drafts.write("a", "text",);
    drafts.write("a", "",);

    expect(drafts.read("a",),).toBeNull();
    expect(drafts.readIndex(),).toEqual([],);
  });

  test("reads expire past ttlMs using the injected clock", () => {
    const store = memStore();
    let clock = 1_000_000;
    const drafts = createKeyedDraftStore({
      prefix: PREFIX,
      indexKey: INDEX_KEY,
      ttlMs: 5_000,
      storage: store,
      now: () => clock,
    },);

    drafts.write("a", "fresh",);
    expect(drafts.read("a",)?.text,).toBe("fresh",);

    clock += 6_000;
    expect(drafts.read("a",),).toBeNull();
  });

  test("corrupt index reads as empty", () => {
    const store = memStore();
    store.setItem(INDEX_KEY, "{not-json",);
    const drafts = createKeyedDraftStore({ prefix: PREFIX, indexKey: INDEX_KEY, storage: store, },);
    expect(drafts.readIndex(),).toEqual([],);
  });
});
