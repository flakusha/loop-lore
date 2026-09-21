// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * model-catalog: manifest shape narrowing, fetch tolerance, size totals.
 */

import { describe, expect, test, } from "bun:test";
import {
  type CatalogModel,
  catalogTotalBytes,
  fetchCapability,
  fetchCatalog,
  isCatalogModel,
  isGgufMagic,
  isGgufSplitEntry,
  orderSplitFiles,
  parseGgufSplitName,
} from "./model-catalog";

const ENTRY: CatalogModel = {
  id: "m1",
  label: "Model One",
  engine: "transformers-webgpu",
  parameters: "360M",
  quantization: "q8f16",
  files: [
    { name: "model.onnx", url: "https://cdn.example.com/m1/model.onnx", sizeBytes: 100, sha256: "a".repeat(64,), },
    { name: "tokenizer.json", url: "https://cdn.example.com/m1/tokenizer.json", },
  ],
};

function jsonResponse(payload: unknown, status = 200,): Response {
  return new Response(JSON.stringify(payload,), { status, },);
}

describe("model-catalog", () => {
  test("fetchCatalog returns models on the known shape", async () => {
    const seen: string[] = [];
    const models = await fetchCatalog(async (url,) => {
      seen.push(url,);
      return jsonResponse({ models: [ENTRY,], },);
    },);
    expect(seen,).toEqual(["/api/v1/local-inference/manifest",],);
    expect(models,).toEqual([ENTRY,],);
  });

  test("fetchCatalog throws on HTTP failure", async () => {
    await expect(fetchCatalog(async () => jsonResponse({}, 500,)),).rejects.toThrow(
      "Manifest request failed (500)",
    );
  });

  test("fetchCatalog yields empty on unknown shapes", async () => {
    expect(await fetchCatalog(async () => jsonResponse({ models: "nope", },)),).toEqual([],);
    expect(await fetchCatalog(async () => jsonResponse({},)),).toEqual([],);
    expect(await fetchCatalog(async () => jsonResponse({ models: [ENTRY, { id: 1, },], },)),).toEqual(
      [],
    );
  });

  test("isCatalogModel rejects the retired cdn/approxSizeMB shape", () => {
    expect(
      isCatalogModel({
        id: "m1",
        label: "Model One",
        engine: "transformers-webgpu",
        parameters: "360M",
        approxSizeMB: 380,
        cdn: "https://cdn.example.com/m1",
      },),
    ).toBe(false,);
    expect(isCatalogModel(null,),).toBe(false,);
    expect(isCatalogModel({ ...ENTRY, files: [{ name: "x", url: 7, },], },),).toBe(false,);
    expect(
      isCatalogModel({ ...ENTRY, files: [{ name: "x", url: "https://x", sizeBytes: "big", },], },),
    ).toBe(false,);
    expect(
      isCatalogModel({ ...ENTRY, files: [{ name: "x", url: "https://x", sha256: 42, },], },),
    ).toBe(false,);
    expect(isCatalogModel(ENTRY,),).toBe(true,);
  });

  test("catalogTotalBytes sums known sizes or yields undefined", () => {
    expect(
      catalogTotalBytes({
        ...ENTRY,
        files: [
          { name: "a", url: "https://x/a", sizeBytes: 10, },
          { name: "b", url: "https://x/b", sizeBytes: 20, },
        ],
      },),
    ).toBe(30,);
    expect(catalogTotalBytes(ENTRY,),).toBeUndefined();
    expect(catalogTotalBytes({ ...ENTRY, files: [], },),).toBe(0,);
  });
});

describe("fetchCapability", () => {
  test("passes through the server flag", async () => {
    expect(await fetchCapability(async () => jsonResponse({ downloadsAllowed: false, },)),).toEqual({
      downloadsAllowed: false,
    },);
    expect(await fetchCapability(async () => jsonResponse({ downloadsAllowed: true, },)),).toEqual({
      downloadsAllowed: true,
    },);
  });

  test("fails open on old servers, HTTP errors, and offline", async () => {
    expect(await fetchCapability(async () => jsonResponse({},)),).toEqual({ downloadsAllowed: true, },);
    expect(await fetchCapability(async () => jsonResponse({ downloadsAllowed: false, }, 500,)),).toEqual({
      downloadsAllowed: true,
    },);
    expect(
      await fetchCapability(async () => {
        throw new Error("offline",);
      },),
    ).toEqual({ downloadsAllowed: true, },);
  });
});

describe("gguf split-chunk contract", () => {
  const split = (names: string[],): CatalogModel => ({
    ...ENTRY,
    files: names.map((name,) => ({ name, url: `https://cdn.example.com/m1/${name}`, sizeBytes: 10, })),
  });

  test("parseGgufSplitName accepts zero-padded chunk names", () => {
    expect(parseGgufSplitName("model-00001-of-00003.gguf",),).toEqual({ stem: "model", index: 1, total: 3, },);
    expect(parseGgufSplitName("my-model-q4-00012-of-00012.gguf",),).toEqual({
      stem: "my-model-q4",
      index: 12,
      total: 12,
    },);
  });

  test("parseGgufSplitName rejects non-chunk and out-of-range names", () => {
    expect(parseGgufSplitName("model.gguf",),).toBeNull();
    expect(parseGgufSplitName("model-1-of-3.gguf",),).toBeNull();
    expect(parseGgufSplitName("model-00004-of-00003.gguf",),).toBeNull();
    expect(parseGgufSplitName("model-00000-of-00003.gguf",),).toBeNull();
    expect(parseGgufSplitName("model.onnx",),).toBeNull();
  });

  test("isGgufSplitEntry needs a single non-empty chunk family", () => {
    expect(isGgufSplitEntry(split(["m-00001-of-00002.gguf", "m-00002-of-00002.gguf",],),),).toBe(true,);
    expect(isGgufSplitEntry(ENTRY,),).toBe(false,);
    expect(isGgufSplitEntry({ ...ENTRY, files: [], },),).toBe(false,);
    expect(isGgufSplitEntry(split(["a-00001-of-00002.gguf", "b-00002-of-00002.gguf",],),),).toBe(false,);
    expect(isGgufSplitEntry(split(["a-00001-of-00002.gguf", "notes.txt",],),),).toBe(false,);
  });

  test("orderSplitFiles sorts shuffled chunks and rejects gaps", () => {
    const ordered = orderSplitFiles(split(["m-00002-of-00002.gguf", "m-00001-of-00002.gguf",],),);
    expect(ordered?.map((file,) => file.name),).toEqual([
      "m-00001-of-00002.gguf",
      "m-00002-of-00002.gguf",
    ],);
    expect(orderSplitFiles(split(["m-00001-of-00003.gguf", "m-00003-of-00003.gguf",],),),).toBeNull();
    expect(orderSplitFiles(split(["m-00001-of-00002.gguf", "m-00001-of-00002.gguf",],),),).toBeNull();
    expect(orderSplitFiles(ENTRY,),).toBeNull();
  });

  test("isGgufMagic matches the 4-byte header", () => {
    expect(isGgufMagic(new Uint8Array([0x47, 0x47, 0x55, 0x46, 0x00,],),),).toBe(true,);
    expect(isGgufMagic(new Uint8Array([0x47, 0x47, 0x55, 0x00,],),),).toBe(false,);
    expect(isGgufMagic(new Uint8Array([0x47, 0x47,],),),).toBe(false,);
    expect(isGgufMagic(new Uint8Array(0,),),).toBe(false,);
  });
});
