// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterAll, beforeEach, describe, expect, test, } from "bun:test";
import {
  clearCache,
  createLoadingIndicator,
  getCachedImage,
  getCacheSize,
  getImageWithFallback,
  isImageCached,
  preloadImage,
  preloadImages,
  preloadSceneImages,
  type SceneImages,
} from "./image-preloader";

// ── Boundary stubs (extends the shared document from tests/setup-globals.ts) ──

/** Controllable Image stand-in: preloadImage attaches load/error listeners. */
class FakeImage {
  static instances: FakeImage[] = [];
  src = "";
  private readonly handlers = new Map<string, Array<() => void>>();

  constructor() {
    FakeImage.instances.push(this,);
  }

  addEventListener(type: string, handler: () => void,): void {
    this.handlers.set(type, [...this.handlers.get(type,) ?? [], handler,],);
  }

  dispatch(type: string,): void {
    for (const handler of this.handlers.get(type,) ?? []) { handler(); }
  }
}

/** Minimal element covering the DOM surface image-preloader touches. */
class FakeElement {
  readonly children: FakeElement[] = [];
  readonly customProps = new Map<string, string>();
  readonly style = {
    setProperty: (name: string, value: string,) => {
      this.customProps.set(name, value,);
    },
  } as unknown as CSSStyleDeclaration;
  className = "";
  textContent = "";
  src = "";

  append(...nodes: FakeElement[]): void {
    this.children.push(...nodes,);
  }
}

const originalDocument = globalThis.document;
const originalImage = globalThis.Image;
globalThis.document = {
  ...originalDocument,
  createElement: () => new FakeElement(),
} as unknown as Document;
globalThis.Image = FakeImage as unknown as typeof Image;
afterAll(() => {
  globalThis.document = originalDocument;
  globalThis.Image = originalImage;
},);

beforeEach(() => {
  FakeImage.instances = [];
  clearCache();
},);

/** Most recently constructed FakeImage (src is set synchronously by preloadImage). */
function latestImage(): FakeImage {
  const img = FakeImage.instances.at(-1,);
  if (!img) { throw new Error("no Image was constructed",); }
  return img;
}

/** Complete a fresh in-flight preload as a successful load. */
async function loadUrl(url: string,): Promise<void> {
  const pending = preloadImage(url,);
  latestImage().dispatch("load",);
  await pending;
}

describe("preloadImage", () => {
  test("resolves loaded, caches the element, and serves repeats from cache", async () => {
    const url = "https://cdn.test/a.png";
    const pending = preloadImage(url,);
    expect(FakeImage.instances,).toHaveLength(1,);
    expect(latestImage().src,).toBe(url,);

    latestImage().dispatch("load",);
    expect(await pending,).toEqual({ url, loaded: true, },);
    expect(isImageCached(url,),).toBe(true,);
    expect(getCachedImage(url,) as unknown as FakeImage,).toBe(latestImage(),);
    expect(await preloadImage(url,),).toEqual({ url, loaded: true, },);
    expect(FakeImage.instances,).toHaveLength(1,);
  });

  test("resolves with an error result and skips the cache on error", async () => {
    const url = "https://cdn.test/broken.png";
    const pending = preloadImage(url,);
    latestImage().dispatch("error",);
    expect(await pending,).toEqual({ url, loaded: false, error: `Failed to load: ${url}`, },);
    expect(isImageCached(url,),).toBe(false,);
    expect(getCacheSize(),).toBe(0,);
  });

  test("concurrent requests for one url share a single Image load", async () => {
    const url = "https://cdn.test/shared.png";
    const first = preloadImage(url,);
    const second = preloadImage(url,);
    expect(FakeImage.instances,).toHaveLength(1,);
    latestImage().dispatch("load",);
    expect(await first,).toEqual({ url, loaded: true, },);
    expect(await second,).toEqual({ url, loaded: true, },);
  });

  test("a failed load also unblocks concurrent waiters without caching", async () => {
    const url = "https://cdn.test/failing.png";
    const first = preloadImage(url,);
    const second = preloadImage(url,);
    latestImage().dispatch("error",);
    expect(await first,).toEqual({ url, loaded: false, error: `Failed to load: ${url}`, },);
    const result = await second;
    expect(result.loaded,).toBe(false,);
    expect(result.error,).toBeUndefined();
  });
});

describe("preloadImages", () => {
  test("returns per-url results in input order, errors included", async () => {
    const url = (n: number,) => `https://cdn.test/batch-${n}.png`;
    const pending = preloadImages([url(1,), url(2,), url(3,),],);
    const [a, b, c,] = FakeImage.instances;
    a?.dispatch("load",);
    b?.dispatch("error",);
    c?.dispatch("load",);

    expect(await pending,).toEqual([
      { url: url(1,), loaded: true, },
      { url: url(2,), loaded: false, error: `Failed to load: ${url(2,)}`, },
      { url: url(3,), loaded: true, },
    ],);
  });

  test("deduplicates repeated urls within one batch; empty batches resolve empty", async () => {
    const url = "https://cdn.test/dup.png";
    expect(await preloadImages([],),).toEqual([],);

    const pending = preloadImages([url, url,],);
    expect(FakeImage.instances,).toHaveLength(1,);
    latestImage().dispatch("load",);
    expect(await pending,).toEqual([{ url, loaded: true, }, { url, loaded: true, },],);
  });
});

describe("preloadSceneImages", () => {
  const url = (n: number,) => `https://cdn.test/scene-${n}.png`;

  test("collects the current+next window deduped; fully cached windows are not refetched", async () => {
    const scenes: SceneImages[] = [
      { backgroundUrl: url(1,), portraitUrl: url(2,), },
      { backgroundUrl: url(3,), },
      { portraitUrl: url(2,), },
    ];
    const pending = preloadSceneImages(scenes, 0, 2,);
    expect(FakeImage.instances,).toHaveLength(3,); // window = scenes 0-2; dup portrait dropped
    for (const img of FakeImage.instances) { img.dispatch("load",); }
    expect(await pending,).toEqual({ total: 3, loaded: 3, failed: 0, cached: 0, },);

    expect(await preloadSceneImages(scenes, 0, 2,),).toEqual({ total: 3, loaded: 0, failed: 0, cached: 3, },);
    expect(FakeImage.instances,).toHaveLength(3,);
  });

  test("still fetches the uncached remainder of a partially cached window", async () => {
    await loadUrl(url(1,),);
    const pending = preloadSceneImages([{ backgroundUrl: url(1,), portraitUrl: url(2,), },], 0, 1,);
    expect(FakeImage.instances,).toHaveLength(2,); // 1 warm + exactly one new fetch
    FakeImage.instances[1]?.dispatch("load",);
    expect(await pending,).toEqual({ total: 2, loaded: 1, failed: 0, cached: 1, },);
  });

  test("clamps to array bounds and skips scenes without urls", async () => {
    const pending = preloadSceneImages([{ backgroundUrl: url(9,), }, {}, {},], 2, 3,);
    expect(FakeImage.instances,).toHaveLength(0,);
    expect(await pending,).toEqual({ total: 0, loaded: 0, failed: 0, cached: 0, },);
  });

  test("reports failures per url in stats", async () => {
    const pending = preloadSceneImages([{ backgroundUrl: url(1,), portraitUrl: url(2,), },], 0, 1,);
    FakeImage.instances[0]?.dispatch("load",);
    FakeImage.instances[1]?.dispatch("error",);
    expect(await pending,).toEqual({ total: 2, loaded: 1, failed: 1, cached: 0, },);
  });
});

describe("cache management", () => {
  test("evicts oldest entries beyond the 50-image cap; clearCache drops all", async () => {
    for (let i = 0; i < 52; i++) {
      await loadUrl(`https://cdn.test/bulk-${i}.png`,);
    }
    expect(getCacheSize(),).toBe(50,);
    expect(isImageCached("https://cdn.test/bulk-0.png",),).toBe(false,);
    expect(isImageCached("https://cdn.test/bulk-1.png",),).toBe(false,);
    expect(isImageCached("https://cdn.test/bulk-2.png",),).toBe(true,);
    expect(isImageCached("https://cdn.test/bulk-51.png",),).toBe(true,);

    clearCache();
    expect(getCacheSize(),).toBe(0,);
    expect(getCachedImage("https://cdn.test/bulk-51.png",),).toBeUndefined();
  });
});

describe("getImageWithFallback", () => {
  test("missing or empty url falls back (default or custom), present url passes through", () => {
    expect(getImageWithFallback(undefined,),).toBe("/images/vn-placeholder.png",);
    expect(getImageWithFallback("",),).toBe("/images/vn-placeholder.png",);
    expect(getImageWithFallback(undefined, "custom.png",),).toBe("custom.png",);
    expect(getImageWithFallback("https://cdn.test/ok.png", "custom.png",),).toBe("https://cdn.test/ok.png",);
  });
});

describe("createLoadingIndicator", () => {
  test("toggles a container-attached indicator and writes progress text/property", () => {
    const container = new FakeElement();
    const indicator = createLoadingIndicator(container as unknown as HTMLElement,);
    expect(container.children,).toHaveLength(1,);
    const el = container.children[0];
    expect(el?.className,).toBe("vn-loading-indicator",);
    expect(el?.style.display,).toBe("none",);

    indicator.show();
    expect(el?.style.display,).toBe("flex",);
    indicator.hide();
    expect(el?.style.display,).toBe("none",);

    const text = el?.children[0];
    const progress = el?.children[1];
    indicator.updateProgress(1, 4,);
    expect(text?.textContent,).toBe("Loading images... 1/4",);
    expect(progress?.customProps.get("--progress",),).toBe("0.25",);
    indicator.updateProgress(0, 0,);
    expect(progress?.customProps.get("--progress",),).toBe("0",);
  });
});
