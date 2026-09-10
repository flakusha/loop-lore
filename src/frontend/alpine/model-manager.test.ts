// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * model-manager: catalog tolerance, URL download with resume, storage
 * management, and input validation.
 */

import { describe, expect, test, } from "bun:test";
import { downloadModel, type DownloadOpts, } from "./model-downloader";
import { type CatalogModel, createModelManager, } from "./model-manager";
import { createMemoryStore, } from "./model-storage";

const CATALOG: CatalogModel[] = [
  {
    id: "m1",
    label: "Model One",
    engine: "transformers-webgpu",
    parameters: "360M",
    approxSizeMB: 380,
    cdn: "https://cdn.example.com/m1",
  },
];

const encode = (text: string,): Uint8Array => new TextEncoder().encode(text,);

function cannedDownload(seen: { url: string }[], body: string,): typeof downloadModel {
  return (async (opts: DownloadOpts,): Promise<Uint8Array> => {
    seen.push({ url: opts.url, },);
    opts.onProgress?.({ loadedBytes: body.length, totalBytes: body.length, },);
    return encode(body,);
  }) as typeof downloadModel;
}

describe("model-manager", () => {
  test("init loads catalog and stored models", async () => {
    const store = createMemoryStore();
    await store.save("old", { bytes: encode("ab",), sha256: "s", updatedAt: 1, },);
    const manager = createModelManager({ loadCatalog: async () => CATALOG, store, },);
    await manager.init();
    expect(manager.catalog.map((entry,) => entry.id),).toEqual(["m1",],);
    expect(manager.stored.map((entry,) => entry.id),).toEqual(["old",],);
    expect(manager.usageBytes,).toBe(2,);
    expect(manager.catalogError,).toBeNull();
  });

  test("init tolerates catalog failure", async () => {
    const manager = createModelManager({
      loadCatalog: async () => {
        throw new Error("offline",);
      },
      store: createMemoryStore(),
    },);
    await manager.init();
    expect(manager.catalog,).toEqual([],);
    expect(manager.catalogError,).not.toBeNull();
  });

  test("downloadFromUrl saves verified bytes and refreshes", async () => {
    const store = createMemoryStore();
    const seen: { url: string }[] = [];
    const manager = createModelManager({
      store,
      download: cannedDownload(seen, "abc",),
      digest: async () => "computed-sha",
    },);
    manager.downloadUrl = "https://cdn.example.com/tiny.gguf";
    manager.downloadSha = "";
    await manager.downloadFromUrl();
    expect(seen.map((call,) => call.url),).toEqual(["https://cdn.example.com/tiny.gguf",],);
    expect(manager.error,).toBeNull();
    expect(manager.downloadUrl,).toBe("",);
    const stored = await store.load("tiny.gguf",);
    expect(new TextDecoder().decode(stored?.bytes,),).toBe("abc",);
    expect(stored?.sha256,).toBe("computed-sha",);
  });

  test("downloadFromUrl keeps caller-supplied checksum", async () => {
    const store = createMemoryStore();
    const manager = createModelManager({
      store,
      download: cannedDownload([], "abc",),
      digest: async () => {
        throw new Error("must not run",);
      },
    },);
    manager.downloadUrl = "https://cdn.example.com/tiny.gguf?dl=1";
    manager.downloadSha = "ABCDEF";
    manager.downloadId = "custom-id";
    await manager.downloadFromUrl();
    expect((await store.load("custom-id",))?.sha256,).toBe("ABCDEF",);
  });

  test("downloadFromUrl rejects non-http URLs", async () => {
    const manager = createModelManager({ store: createMemoryStore(), },);
    manager.downloadUrl = "ftp://cdn.example.com/tiny.gguf";
    await manager.downloadFromUrl();
    expect(manager.error,).not.toBeNull();
    expect(manager.downloadingId,).toBeNull();
  });

  test("downloadFromUrl surfaces download failure", async () => {
    const manager = createModelManager({
      store: createMemoryStore(),
      download: (async () => {
        throw new Error("boom (500)",);
      }) as typeof downloadModel,
    },);
    manager.downloadUrl = "https://cdn.example.com/tiny.gguf";
    await manager.downloadFromUrl();
    expect(manager.error,).toBe("boom (500)",);
    expect(manager.downloadingId,).toBeNull();
    expect(manager.progress,).toBeNull();
  });

  test("removeModel deletes and refreshes usage", async () => {
    const store = createMemoryStore();
    await store.save("gone", { bytes: encode("ab",), sha256: "s", updatedAt: 1, },);
    const manager = createModelManager({ store, loadCatalog: async () => [], },);
    await manager.init();
    await manager.removeModel("gone",);
    expect(manager.stored,).toEqual([],);
    expect(manager.usageBytes,).toBe(0,);
  });

  test("formatSize covers B through GB", () => {
    const manager = createModelManager({ store: createMemoryStore(), },);
    expect(manager.formatSize(512,),).toBe("512 B",);
    expect(manager.formatSize(2048,),).toBe("2.0 KB",);
    expect(manager.formatSize(3_145_728,),).toBe("3.0 MB",);
    expect(manager.formatSize(2_147_483_648,),).toBe("2.00 GB",);
  });
});
