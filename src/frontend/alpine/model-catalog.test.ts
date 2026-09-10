// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * model-catalog: manifest shape narrowing, fetch tolerance, size totals.
 */

import { describe, expect, test, } from "bun:test";
import {
  type CatalogModel,
  catalogTotalBytes,
  fetchCatalog,
  isCatalogModel,
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
    expect(seen,).toEqual(["/api/local-inference/manifest",],);
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
