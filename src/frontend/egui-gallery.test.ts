// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for egui-gallery.ts: the bridge-owned thumbnail fetch/decode and the
 * upload path through a hidden file input.
 *
 * Attaching an asset is not tested here — it happens on the Rust side through
 * the crate's own POST client, not through this bridge.
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

const { requestThumbnail, uploadAsset, } = await import("./egui-gallery");

const realSink = (globalThis as Record<string, unknown>).loopLoreEguiGallery;
const realRequest = (globalThis as Record<string, unknown>).requestThumbnail;
const realUpload = (globalThis as Record<string, unknown>).uploadAsset;

let sinkCalls: Array<{ method: string; assetId: string; width?: number; height?: number; rgba?: Uint8ClampedArray }> =
  [];

const recordingSink: EguiGallerySink = {
  eguiThumbReady: (assetId, width, height, rgba,) =>
    void sinkCalls.push({ method: "eguiThumbReady", assetId, width, height, rgba, },),
  eguiThumbFailed: (assetId,) => void sinkCalls.push({ method: "eguiThumbFailed", assetId, },),
  eguiAssetUploaded: (assetId,) => void sinkCalls.push({ method: "eguiAssetUploaded", assetId, },),
};

afterEach(() => {
  sinkCalls = [];
  mockFetchCalls = [];
  mockFetchResponse = new Response("", { status: 200, },);
  (globalThis as Record<string, unknown>).loopLoreEguiGallery = realSink;
  (globalThis as Record<string, unknown>).requestThumbnail = realRequest;
  (globalThis as Record<string, unknown>).uploadAsset = realUpload;
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
    expect(sinkCalls[0]?.method,).toBe("eguiThumbReady",);
    expect(sinkCalls[0]?.assetId,).toBe("a1",);
    expect(sinkCalls[0]?.width,).toBe(2,);
    expect(sinkCalls[0]?.height,).toBe(2,);
    expect(sinkCalls[0]?.rgba?.length,).toBe(16,);
  });

  test("reports failure to the sink on fetch error", async () => {
    (globalThis as Record<string, unknown>).loopLoreEguiGallery = recordingSink;
    mockFetchResponse = new Response("nope", { status: 500, },);

    await requestThumbnail("a1", "/api/v1/assets/a1/thumb",);

    expect(sinkCalls.length,).toBe(1,);
    expect(sinkCalls[0]?.method,).toBe("eguiThumbFailed",);
    expect(sinkCalls[0]?.assetId,).toBe("a1",);
  });
});

describe("uploadAsset", () => {
  test("opens the picker, posts the chosen file as multipart, and reports the new id", async () => {
    (globalThis as Record<string, unknown>).loopLoreEguiGallery = recordingSink;
    mockFetchResponse = Response.json({ id: "new-asset", },);
    const originalDocument = globalThis.document;
    let changeHandler: (() => void) | null = null;
    const input: Record<string, unknown> = {
      type: "",
      accept: "",
      style: {},
      files: [new File(["bytes",], "cat.png", { type: "image/png", },),],
      addEventListener: (_event: string, handler: () => void,) => {
        changeHandler = handler;
      },
      click: () => {},
      remove: () => {},
    };

    (globalThis as Record<string, unknown>).document = {
      createElement: () => input,
      body: { appendChild: () => {}, },
    };

    try {
      uploadAsset();
      expect(input.accept,).toContain("image/*",);
      expect(changeHandler,).toBeFunction();
      (changeHandler as (() => void) | null)?.();
      // The upload is async; let the multipart POST settle.
      await new Promise((resolve,) => setTimeout(resolve, 0,));
    } finally {
      globalThis.document = originalDocument;
    }

    expect(mockFetchCalls.length,).toBe(1,);
    expect(mockFetchCalls[0]?.url,).toBe("/api/v1/assets",);
    expect(mockFetchCalls[0]?.options?.method,).toBe("POST",);
    expect(mockFetchCalls[0]?.options?.body,).toBeInstanceOf(FormData,);
    expect((mockFetchCalls[0]?.options?.body as FormData).get("alt_text",),).toBe("cat.png",);
    expect(sinkCalls.length,).toBe(1,);
    expect(sinkCalls[0]?.method,).toBe("eguiAssetUploaded",);
    expect(sinkCalls[0]?.assetId,).toBe("new-asset",);
  });

  test("reports an empty id when the upload request fails", async () => {
    (globalThis as Record<string, unknown>).loopLoreEguiGallery = recordingSink;
    const originalDocument = globalThis.document;
    let changeHandler: (() => void) | null = null;
    (globalThis as Record<string, unknown>).document = {
      createElement: () => ({
        type: "",
        accept: "",
        style: {},
        files: [new File(["bytes",], "cat.png", { type: "image/png", },),],
        addEventListener: (_event: string, handler: () => void,) => {
          changeHandler = handler;
        },
        click: () => {},
        remove: () => {},
      }),
      body: { appendChild: () => {}, },
    };

    mockFetchResponse = new Response("nope", { status: 500, },);

    try {
      uploadAsset();
      (changeHandler as (() => void) | null)?.();
      await new Promise((resolve,) => setTimeout(resolve, 0,));
    } finally {
      globalThis.document = originalDocument;
    }

    expect(sinkCalls.length,).toBe(1,);
    expect(sinkCalls[0]?.method,).toBe("eguiAssetUploaded",);
    expect(sinkCalls[0]?.assetId,).toBe("",);
  });
});
