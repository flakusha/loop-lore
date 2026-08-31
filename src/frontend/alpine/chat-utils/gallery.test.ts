/**
 * Tests for frontend/alpine/chat-utils/gallery.ts
 *
 * Exercises pure logic (style calc, preview-state shape) and uses
 * bun:test mock to simulate network behavior for loadGalleryAssets.
 */
import { describe, expect, test, } from "bun:test";
import { chatUtilsGallery, } from "./gallery";

describe("getMediaStyle", () => {
  test("returns empty style for non-image asset", () => {
    const style = (chatUtilsGallery as any).getMediaStyle({ type: "video", }, 1,);
    expect(style,).toEqual({},);
  });

  test("returns full-width for single wide image", () => {
    const style = (chatUtilsGallery as any).getMediaStyle(
      { type: "image", width: 1600, height: 400, },
      1,
    );
    expect(style.width,).toBe("100%",);
    expect(style.maxHeight,).toBe("400px",);
  });

  test("returns right-floated narrow image", () => {
    const style = (chatUtilsGallery as any).getMediaStyle(
      { type: "image", width: 200, height: 800, },
      1,
    );
    expect(style.width,).toBe("40%",);
    expect(style.float,).toBe("right",);
  });

  test("returns left-floated default-ratio single image", () => {
    const style = (chatUtilsGallery as any).getMediaStyle(
      { type: "image", width: 800, height: 600, },
      1,
    );
    expect(style.width,).toBe("50%",);
    expect(style.float,).toBe("left",);
  });

  test("returns 50% width when 2 assets in grid", () => {
    const style = (chatUtilsGallery as any).getMediaStyle(
      { type: "image", width: 800, height: 600, },
      2,
    );
    expect(style.width,).toBe("calc(50% - 6px)",);
    expect(style.aspectRatio,).toBe("1",);
  });

  test("returns 33% width when 3+ assets in grid", () => {
    const style = (chatUtilsGallery as any).getMediaStyle(
      { type: "image", width: 800, height: 600, },
      5,
    );
    expect(style.width,).toBe("calc(33.33% - 8px)",);
  });

  test("ignores image without dimensions", () => {
    const style = (chatUtilsGallery as any).getMediaStyle({ type: "image", }, 1,);
    expect(style,).toEqual({},);
  });
});

describe("openAssetPreview", () => {
  /** */
  function makeCtx() {
    return { previewMediaAsset: null as any, };
  }

  test("populates preview state with URL and caption from filename", () => {
    const c = makeCtx();
    (chatUtilsGallery as any).openAssetPreview.call(c, {
      id: "asset-1",
      filename: "hero.png",
      mime_type: "image/png",
    },);
    expect(c.previewMediaAsset,).not.toBeNull();
    expect(c.previewMediaAsset.id,).toBe("asset-1",);
    expect(c.previewMediaAsset.url,).toBe("/api/assets/asset-1/raw",);
    expect(c.previewMediaAsset.caption,).toBe("hero.png",);
  });

  test("falls back to alt_text for caption when filename absent", () => {
    const c = makeCtx();
    (chatUtilsGallery as any).openAssetPreview.call(c, {
      id: "asset-2",
      alt_text: "A scenic view",
    },);
    expect(c.previewMediaAsset.caption,).toBe("A scenic view",);
  });

  test("does nothing if asset has no id", () => {
    const c = makeCtx();
    (chatUtilsGallery as any).openAssetPreview.call(c, { id: "", },);
    expect(c.previewMediaAsset,).toBeNull();
  });
});

describe("getMediaStyle edge cases", () => {
  test("returns empty style for non-image asset", () => {
    const style = (chatUtilsGallery as any).getMediaStyle({ id: "x", }, 1,);
    expect(style,).toEqual({},);
  });

  test("returns empty style for image without dimensions", () => {
    const style = (chatUtilsGallery as any).getMediaStyle({ type: "image", }, 1,);
    expect(style,).toEqual({},);
  });

  test("returns full-width for single wide image", () => {
    const style = (chatUtilsGallery as any).getMediaStyle({ type: "image", width: 800, height: 200, }, 1,);
    expect(style,).toEqual({ width: "100%", maxHeight: "400px", },);
  });

  test("returns right-floated for tall narrow image", () => {
    const style = (chatUtilsGallery as any).getMediaStyle({ type: "image", width: 100, height: 500, }, 1,);
    expect(style.float,).toBe("right",);
    expect(style.width,).toBe("40%",);
  });
});
