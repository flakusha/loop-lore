// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the preview-modal anchor editor wiring: early return without a
 * preview image, prefill from the sprite transform, transport failure
 * fallbacks, click-to-save round-trip, and remount disposal.
 */
import { afterEach, beforeEach, describe, expect, mock, test, } from "bun:test";
import { mountPreviewAnchorEditor, } from "./asset-preview-anchor";
import { type FakeDom, type FakeEl, installVnFakeDom, makeEl, tick, } from "./tests/vn-fake-dom";

let dom: FakeDom;
let calls: { url: string; opts: RequestInit }[];
let feHandler: ((url: string, opts: RequestInit,) => Response | Promise<Response>) | null;

mock.module("./fe-fetch", () => ({
  feFetch: async (url: string, opts: RequestInit = {},) => {
    calls.push({ url, opts, },);
    return feHandler ? feHandler(url, opts,) : new Response("{}", { status: 404, },);
  },
  getCsrfToken: () => "",
}),);

beforeEach(() => {
  dom = installVnFakeDom();
  calls = [];
  feHandler = null;
},);
afterEach(() => {
  dom.restore();
},);

function mountedBody(): { body: FakeEl; img: FakeEl } {
  const body = makeEl("div",);
  const img = makeEl("img",);
  img.getBoundingClientRect = () => {
    return { left: 10, top: 20, width: 200, height: 100, };
  };
  body.append(img,);
  return { body, img, };
}

async function flush(times = 6,) {
  for (let i = 0; i < times; i += 1) { await tick(); }
}

describe("mountPreviewAnchorEditor", () => {
  test("returns early when the body has no preview image", () => {
    const body = makeEl("div",);
    mountPreviewAnchorEditor(body as unknown as HTMLElement, "a1",);
    expect(calls,).toEqual([],);
    expect(body.querySelector(".asset-anchor-marker",),).toBeNull();
  });

  test("prefills the marker from the sprite transform", async () => {
    feHandler = (url,) => {
      expect(url,).toContain("/transform?context=sprite",);
      return new Response(JSON.stringify({ focal_point_x: 0.4, focal_point_y: 0.3, },), { status: 200, },);
    };
    const { body, } = mountedBody();
    mountPreviewAnchorEditor(body as unknown as HTMLElement, "a1",);
    await flush();
    const marker = body.querySelector(".asset-anchor-marker",);
    expect(marker?.style["left"],).toBe("40%",);
    expect(marker?.style["top"],).toBe("30%",);
  });

  test("leaves the marker unplaced when no transform resolves", async () => {
    const { body, } = mountedBody();
    mountPreviewAnchorEditor(body as unknown as HTMLElement, "a1",);
    await flush();
    const marker = body.querySelector(".asset-anchor-marker",);
    expect(marker,).not.toBeNull();
    expect(marker?.style["left"],).toBeUndefined();
  });

  test("leaves the marker unplaced when the transport throws", async () => {
    feHandler = () => {
      throw new Error("offline",);
    };
    const { body, } = mountedBody();
    mountPreviewAnchorEditor(body as unknown as HTMLElement, "a1",);
    await flush();
    const marker = body.querySelector(".asset-anchor-marker",);
    expect(marker,).not.toBeNull();
    expect(marker?.style["left"],).toBeUndefined();
  });

  test("click PUTs the normalized focal point", async () => {
    feHandler = (_url, opts,) => {
      if (opts.method === "PUT") { return new Response("{}", { status: 200, },); }
      return new Response("{}", { status: 404, },);
    };
    const { body, img, } = mountedBody();
    mountPreviewAnchorEditor(body as unknown as HTMLElement, "a7",);
    await flush();
    img.dispatch("click", { clientX: 110, clientY: 70, },);
    await flush();
    const put = calls.find((c,) => c.url.includes("/api/assets/a7/transform",) && c.opts.method === "PUT");
    expect(put,).toBeDefined();
    expect(JSON.parse(put!.opts.body as string,),).toEqual({ context: "sprite", focalPointX: 0.5, focalPointY: 0.5, },);
  });

  test("failed save still settles the editor", async () => {
    feHandler = () => new Response("{}", { status: 500, },);
    const { body, img, } = mountedBody();
    mountPreviewAnchorEditor(body as unknown as HTMLElement, "a9",);
    await flush();
    img.dispatch("click", { clientX: 110, clientY: 70, },);
    await flush();
    expect(calls.some((c,) => c.opts.method === "PUT"),).toBe(true,);
  });

  test("save transport throw still settles the editor", async () => {
    let n = 0;
    feHandler = () => {
      n += 1;
      if (n > 1) { throw new Error("offline",); }
      return new Response("{}", { status: 404, },);
    };
    const { body, img, } = mountedBody();
    mountPreviewAnchorEditor(body as unknown as HTMLElement, "a9",);
    await flush();
    img.dispatch("click", { clientX: 110, clientY: 70, },);
    await flush();
    expect(calls.some((c,) => c.opts.method === "PUT"),).toBe(true,);
  });

  test("remount disposes the previous editor", async () => {
    const { body, } = mountedBody();
    const asEl = body as unknown as HTMLElement;
    mountPreviewAnchorEditor(asEl, "a1",);
    await flush();
    mountPreviewAnchorEditor(asEl, "a2",);
    await flush();
    expect(body.querySelectorAll(".asset-anchor-marker",).length,).toBe(1,);
  });
});
