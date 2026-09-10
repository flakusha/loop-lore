// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * catalog-download: per-file resume, verify-or-record, progress totals.
 */

import { describe, expect, test, } from "bun:test";
import {
  catalogStoreKey,
  downloadCatalogEntry,
} from "./catalog-download";
import { type CatalogModel, } from "./model-catalog";
import { downloadModel, type DownloadOpts, type DownloadProgress, } from "./model-downloader";
import { createMemoryStore, } from "./model-storage";

const ENTRY: CatalogModel = {
  id: "m1",
  label: "Model One",
  engine: "transformers-webgpu",
  parameters: "360M",
  quantization: "q8f16",
  files: [
    { name: "a.onnx", url: "https://cdn.example.com/m1/a.onnx", sizeBytes: 3, sha256: "aa", },
    { name: "tok.json", url: "https://cdn.example.com/m1/tok.json", },
  ],
};

const encode = (text: string,): Uint8Array => new TextEncoder().encode(text,);

interface SeenCall {
  url: string;
  expectedSha256?: string;
  sizeBytes?: number;
  resumeLength: number;
}

function cannedDownload(seen: SeenCall[], bodies: Record<string, string>,): typeof downloadModel {
  return (async (opts: DownloadOpts,): Promise<Uint8Array> => {
    seen.push({
      url: opts.url,
      expectedSha256: opts.expectedSha256,
      sizeBytes: opts.sizeBytes,
      resumeLength: opts.resumeFrom?.length ?? 0,
    },);
    const body = bodies[opts.url] ?? "";
    opts.onProgress?.({ loadedBytes: body.length, totalBytes: body.length, },);
    return encode(body,);
  }) as typeof downloadModel;
}

describe("catalog-download", () => {
  test("catalogStoreKey namespaces files under the model id", () => {
    expect(catalogStoreKey("m1", "a.onnx",),).toBe("m1/a.onnx",);
  });

  test("downloads every file with expectations and recorded digests", async () => {
    const store = createMemoryStore();
    const seen: SeenCall[] = [];
    const progress: DownloadProgress[] = [];
    const result = await downloadCatalogEntry({
      entry: ENTRY,
      store,
      download: cannedDownload(seen, {
        "https://cdn.example.com/m1/a.onnx": "AAA",
        "https://cdn.example.com/m1/tok.json": "BB",
      },),
      digest: async () => "computed",
      onProgress: (snapshot,) => progress.push(snapshot,),
    },);
    expect(result,).toEqual({ modelId: "m1", files: ["m1/a.onnx", "m1/tok.json",], totalBytes: 5, },);
    expect(seen,).toEqual([
      { url: "https://cdn.example.com/m1/a.onnx", expectedSha256: "aa", sizeBytes: 3, resumeLength: 0, },
      { url: "https://cdn.example.com/m1/tok.json", expectedSha256: undefined, sizeBytes: undefined, resumeLength: 0, },
    ],);
    expect((await store.load("m1/a.onnx",))?.sha256,).toBe("aa",);
    expect((await store.load("m1/tok.json",))?.sha256,).toBe("computed",);
    expect(progress.length,).toBeGreaterThan(0,);
  });

  test("resumes each file from its stored prefix", async () => {
    const store = createMemoryStore();
    await store.save("m1/a.onnx", { bytes: encode("A",), sha256: "aa", updatedAt: 1, },);
    const seen: SeenCall[] = [];
    await downloadCatalogEntry({
      entry: ENTRY,
      store,
      download: cannedDownload(seen, {
        "https://cdn.example.com/m1/a.onnx": "AAA",
        "https://cdn.example.com/m1/tok.json": "BB",
      },),
    },);
    expect(seen.map((call,) => call.resumeLength),).toEqual([1, 0,],);
  });

  test("aggregates progress across files against the known total", async () => {
    const store = createMemoryStore();
    const progress: DownloadProgress[] = [];
    const sized: CatalogModel = {
      ...ENTRY,
      files: [
        { name: "a", url: "https://x/a", sizeBytes: 10, },
        { name: "b", url: "https://x/b", sizeBytes: 20, },
      ],
    };
    await downloadCatalogEntry({
      entry: sized,
      store,
      download: (async (opts: DownloadOpts,): Promise<Uint8Array> => {
        opts.onProgress?.({ loadedBytes: 5, totalBytes: undefined, },);
        return encode("12345",);
      }) as typeof downloadModel,
      onProgress: (snapshot,) => progress.push(snapshot,),
    },);
    expect(progress[0],).toEqual({ loadedBytes: 5, totalBytes: 30, },);
    expect(progress[1],).toEqual({ loadedBytes: 10, totalBytes: 30, },);
  });

  test("rejects non-http file URLs before downloading", async () => {
    const store = createMemoryStore();
    let calls = 0;
    const entry: CatalogModel = {
      ...ENTRY,
      files: [{ name: "a", url: "ftp://cdn.example.com/a", },],
    };
    await expect(
      downloadCatalogEntry({
        entry,
        store,
        download: (async (): Promise<Uint8Array> => {
          calls += 1;
          return encode("",);
        }) as typeof downloadModel,
      },),
    ).rejects.toThrow("not http(s)",);
    expect(calls,).toBe(0,);
  });

  test("mid-entry failure propagates after earlier files stored", async () => {
    const store = createMemoryStore();
    await expect(
      downloadCatalogEntry({
        entry: ENTRY,
        store,
        download: (async (opts: DownloadOpts,): Promise<Uint8Array> => {
          if (opts.url.endsWith("tok.json",)) { throw new Error("boom (500)",); }
          return encode("AAA",);
        }) as typeof downloadModel,
      },),
    ).rejects.toThrow("boom (500)",);
    expect((await store.load("m1/a.onnx",))?.bytes.length,).toBe(3,);
    expect(await store.load("m1/tok.json",),).toBeNull();
  });
});
