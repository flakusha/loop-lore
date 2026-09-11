/**
 * Tests for frontend/alpine/chat-utils/gallery.ts
 *
 * Exercises pure logic (style calc, preview-state shape) and uses
 * bun:test mock to simulate network behavior for loadGalleryAssets.
 */
import { afterEach, describe, expect, test, } from "bun:test";
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

describe("uploadChatAssets", () => {
  /** */
  function makeUploadCtx() {
    const toasts: { type?: string; message?: string }[] = [];
    const ctx = {
      activeChat: "chat-1",
      galleryAssets: [] as any[],
      galleryReloads: 0,
      $dispatch: (event: string, detail?: { type?: string; message?: string },) => {
        if (event === "show-toast" && detail) { toasts.push(detail,); }
      },
      loadGalleryAssets: async function(this: any,) {
        this.galleryReloads += 1;
        this.galleryAssets = [{ id: "fresh", },];
      },
    };
    return { ctx, toasts, };
  }

  /** */
  function makeFileEvent(names: string[],) {
    const input = {
      files: names.map((n,) => new File(["data",], n, { type: "image/png", },)),
      value: "dirty",
    };
    return { event: { target: input, } as unknown as Event, input, };
  }

  /** */
  function fileNameOf(opts: RequestInit,): string {
    return ((opts.body as FormData).get("file",) as File).name;
  }

  const realApiFetch = (globalThis as { apiFetch?: unknown }).apiFetch;
  let calls: { url: string; opts: RequestInit }[] = [];
  /** */
  function installApiFetch(handler: (url: string, opts: RequestInit,) => Promise<Response> | Response,) {
    calls = [];
    (globalThis as any).apiFetch = async (url: string, opts?: RequestInit,) => {
      const init = opts ?? {};
      calls.push({ url, opts: init, },);
      return handler(url, init,);
    };
  }
  afterEach(() => {
    (globalThis as any).apiFetch = realApiFetch;
    calls = [];
  },);
  /** */
  function uploadCalls() {
    return calls.filter((c,) => c.url === "/api/assets" && (c.opts as { method?: string }).method === "POST");
  }
  /** */
  function linkCalls() {
    return calls.filter((c,) => c.url.endsWith("/links",));
  }

  test("fires all N upload attempts and links each asset", async () => {
    const { ctx, toasts, } = makeUploadCtx();
    let n = 0;
    installApiFetch((url,) => {
      if (url === "/api/assets") {
        n += 1;
        return Response.json({ id: `asset-${n}`, }, { status: 200, },);
      }
      return Response.json({ ok: true, }, { status: 200, },);
    },);
    const { event, input, } = makeFileEvent(["a.png", "b.png", "c.png",],);
    await (chatUtilsGallery as any).uploadChatAssets.call(ctx, event,);
    expect(uploadCalls().length,).toBe(3,);
    expect(linkCalls().length,).toBe(3,);
    for (const c of uploadCalls()) {
      expect(c.opts.body instanceof FormData,).toBe(true,);
    }
    expect(uploadCalls().map((c,) => fileNameOf(c.opts,)).sort(),).toEqual(["a.png", "b.png", "c.png",],);
    expect(toasts.filter((t,) => t.type === "success").length,).toBe(3,);
    expect(input.value,).toBe("",);
    expect(ctx.galleryReloads,).toBe(1,);
  });

  test("one failing upload does not cancel its siblings", async () => {
    const { ctx, toasts, } = makeUploadCtx();
    let n = 0;
    installApiFetch((url, opts,) => {
      if (url === "/api/assets") {
        if (fileNameOf(opts,) === "b.png") {
          return Response.json({ error: "boom", }, { status: 500, },);
        }
        n += 1;
        return Response.json({ id: `asset-${n}`, }, { status: 200, },);
      }
      return Response.json({ ok: true, }, { status: 200, },);
    },);
    const { event, } = makeFileEvent(["a.png", "b.png", "c.png",],);
    await (chatUtilsGallery as any).uploadChatAssets.call(ctx, event,);
    // All three attempts still fire; only the two successes link.
    expect(uploadCalls().length,).toBe(3,);
    expect(linkCalls().length,).toBe(2,);
    expect(toasts.filter((t,) => t.type === "success").length,).toBe(2,);
    expect(toasts.filter((t,) => t.type === "error").length,).toBe(1,);
    expect(ctx.galleryReloads,).toBe(1,);
  });

  test("all uploads dispatch before any resolves (true parallelism)", async () => {
    const { ctx, } = makeUploadCtx();
    const resolvers: Array<() => void> = [];
    let n = 0;
    installApiFetch((url,) => {
      if (url === "/api/assets") {
        n += 1;
        const id = `asset-${n}`;
        return new Promise<Response>((resolve,) => {
          resolvers.push(() => resolve(Response.json({ id, }, { status: 200, },),));
        },);
      }
      return Response.json({ ok: true, }, { status: 200, },);
    },);
    const { event, } = makeFileEvent(["a.png", "b.png", "c.png",],);
    const pending = (chatUtilsGallery as any).uploadChatAssets.call(ctx, event,);
    // The map callbacks run synchronously to their first await, so every
    // upload is already in flight while none has resolved.
    expect(uploadCalls().length,).toBe(3,);
    expect(resolvers.length,).toBe(3,);
    for (const resolve of resolvers) { resolve(); }
    await pending;
    expect(linkCalls().length,).toBe(3,);
    expect(ctx.galleryReloads,).toBe(1,);
  });
});
