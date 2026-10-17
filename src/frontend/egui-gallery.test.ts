// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for egui-gallery.ts: the bridge-owned thumbnail fetch/decode, upload
 * via hidden file input, and attach POST.
 *
 * Resource contract (parallel-safe): each test owns its fake sink and the
 * global bridge functions; afterEach restores the globals captured at module
 * load.
 */
import { afterEach, describe, expect, test, } from "bun:test";
import type { EguiGallerySink, } from "./egui-gallery";

const { mock, } = await import("bun:test");

/** Mock feFetch to return a fake Response. */
let mockFetchResponse: Response = new Response("", { status: 200, },);
let mockFetchCalls: Array<{ url: string; options?: RequestInit }> = [];

mock.module("./fe-fetch", () => ({
  feFetch: (url: string, options?: RequestInit,) => {
    mockFetchCalls.push({ url, options, },);
    return Promise.resolve(mockFetchResponse,);
  },
  getCsrfToken: () => "test-csrf",
}),);

const { attachAsset, requestThumbnail, uploadAsset, } = await import("./egui-gallery");

const realSink = (globalThis as Record<string, unknown>).loopLoreEguiGallery;
const realRequest = (globalThis as Record<string, unknown>).requestThumbnail;
const realUpload = (globalThis as Record<string, unknown>).uploadAsset;
const realAttach = (globalThis as Record<string, unknown>).attachAsset;

let sinkCalls: Array<{ method: string; assetId: string; width?: number; height?: number; rgba?: Uint8ClampedArray }> =
  [];

const recordingSink: EguiGallerySink = {
  eguiThumbReady: (assetId, width, height, rgba,) =>
    void sinkCalls.push({ method: "eguiThumbReady", assetId, width, height, rgba, },),
  eguiThumbFailed: (assetId,) => void sinkCalls.push({ method: "eguiThumbFailed", assetId, },),
  eguiAssetUploaded: (assetId,) => void sinkCalls.push({ method: "eguiAssetUploaded", assetId, },),
  eguiAttachResult: (assetId, ok,) => void sinkCalls.push({ method: "eguiAttachResult", assetId, ok, },),
};

afterEach(() => {
  sinkCalls = [];
  mockFetchCalls = [];
  mockFetchResponse = new Response("", { status: 200, },);
  (globalThis as Record<string, unknown>).loopLoreEguiGallery = realSink;
  (globalThis as Record<string, unknown>).requestThumbnail = realRequest;
  (globalThis as Record<string, unknown>).uploadAsset = realUpload;
  (globalThis as Record<string, unknown>).attachAsset = realAttach;
},);

describe("requestThumbnail", () => {
  test("decodes a blob and delivers RGBA to the sink", async () => {
    (globalThis as Record<string, unknown>).loopLoreEguiGallery = recordingSink;

    const originalBitmap = globalThis.createImageBitmap;
    const originalCanvas = globalThis.OffscreenCanvas;

    globalThis.createImageBitmap = (async (_blob: Blob,) => ({ width: 2, height: 2, })) as typeof createImageBitmap;
    globalThis.OffscreenCanvas = class {
      width: number;
      height: number;
      constructor(width: number, height: number,) {
        this.width = width;
        this.height = height;
      }
      getContext() {
        return {
          drawImage: () => {},
          getImageData: (_x: number, _y: number, w: number, h: number,) => ({
            data: new Uint8ClampedArray(w * h * 4,).fill(255,),
          }),
        };
      }
    } as unknown as typeof OffscreenCanvas;

    try {
      await requestThumbnail("a1", "/api/v1/assets/a1/thumb",);
    } finally {
      if (originalBitmap) { globalThis.createImageBitmap = originalBitmap; }
      if (originalCanvas) { globalThis.OffscreenCanvas = originalCanvas; }
    }

    expect(sinkCalls.length,).toBe(1,);
    expect(sinkCalls[0].method,).toBe("eguiThumbReady",);
    expect(sinkCalls[0].assetId,).toBe("a1",);
    expect(sinkCalls[0].width,).toBe(2,);
    expect(sinkCalls[0].height,).toBe(2,);
    expect(sinkCalls[0].rgba?.length,).toBe(16,);
  });

  test("reports failure to the sink on fetch error", async () => {
    (globalThis as Record<string, unknown>).loopLoreEguiGallery = recordingSink;
    mockFetchResponse = new Response("nope", { status: 500, },);

    await requestThumbnail("a1", "/api/v1/assets/a1/thumb",);

    expect(sinkCalls.length,).toBe(1,);
    expect(sinkCalls[0].method,).toBe("eguiThumbFailed",);
    expect(sinkCalls[0].assetId,).toBe("a1",);
  });
});

describe("uploadAsset", () => {
  test("is exposed on globalThis for the Rust side", () => {
    expect(typeof (globalThis as Record<string, unknown>).uploadAsset,).toBe("function",);
  });
});

describe("attachAsset", () => {
  test("POSTs JSON to the links endpoint", async () => {
    await attachAsset("a1", "c1",);

    expect(mockFetchCalls.length,).toBe(1,);
    expect(mockFetchCalls[0].url,).toContain("/api/v1/assets/a1/links",);
    expect(mockFetchCalls[0].options?.method,).toBe("POST",);
    expect(mockFetchCalls[0].options?.body as string,).toContain('"entityType":"chat"',);
    expect(mockFetchCalls[0].options?.body as string,).toContain('"entityId":"c1"',);
  });
});
