/**
 * Tests for frontend/alpine/chat-utils/gallery.ts
 *
 * Exercises pure logic (style calc, preview-state shape) and uses
 * bun:test mock to simulate network behavior for loadGalleryAssets.
 */
import { afterEach, describe, expect, test, } from "bun:test";
import { chatUtilsGallery, } from "./gallery";

const realPreviewAsset = (globalThis as { __previewAsset?: unknown }).__previewAsset;

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
    expect(c.previewMediaAsset.url,).toBe("/api/v1/assets/asset-1/raw",);
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
    return calls.filter((c,) => c.url === "/api/v1/assets" && (c.opts as { method?: string }).method === "POST");
  }
  /** */
  function linkCalls() {
    return calls.filter((c,) => c.url.endsWith("/links",));
  }

  test("fires all N upload attempts and links each asset", async () => {
    const { ctx, toasts, } = makeUploadCtx();
    let n = 0;
    installApiFetch((url,) => {
      if (url === "/api/v1/assets") {
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
      if (url === "/api/v1/assets") {
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
      if (url === "/api/v1/assets") {
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

describe("loadGalleryAssets / loadMoreGalleryAssets / deletePreviewAsset", () => {
  /** */
  function makeGalleryCtx() {
    const ctx: Record<string, unknown> = {
      activeChat: "chat-1",
      galleryAssets: [] as { id: string }[],
      galleryPage: 1,
      galleryTotal: 0,
      previewMediaAsset: null as any,
    };
    ctx.loadGalleryAssets = (chatUtilsGallery as any).loadGalleryAssets.bind(ctx,);
    return ctx;
  }

  const realApiFetch = (globalThis as { apiFetch?: unknown }).apiFetch;
  const realDeletePreview = (globalThis as { deleteAssetPreview?: unknown }).deleteAssetPreview;
  afterEach(() => {
    (globalThis as any).apiFetch = realApiFetch;
    (globalThis as any).deleteAssetPreview = realDeletePreview;
  },);

  test("loads first page and records pagination total", async () => {
    const ctx: any = makeGalleryCtx();
    (globalThis as any).apiFetch = async () => Response.json({ data: [{ id: "a", },], pagination: { total: 3, }, },);
    await (chatUtilsGallery as any).loadGalleryAssets.call(ctx,);
    expect(ctx.galleryAssets,).toEqual([{ id: "a", },],);
    expect(ctx.galleryPage,).toBe(1,);
    expect(ctx.galleryTotal,).toBe(3,);
  });

  test("clears the list when the fetch fails", async () => {
    const ctx: any = { ...makeGalleryCtx(), galleryAssets: [{ id: "stale", },], galleryTotal: 2, };
    (globalThis as any).apiFetch = async () => Response.json({ error: "down", }, { status: 500, },);
    await (chatUtilsGallery as any).loadGalleryAssets.call(ctx,);
    expect(ctx.galleryAssets,).toEqual([],);
    expect(ctx.galleryTotal,).toBe(0,);
  });

  test("does nothing without an active chat", async () => {
    const ctx: any = { ...makeGalleryCtx(), activeChat: null, };
    let called = false;
    (globalThis as any).apiFetch = async () => {
      called = true;
      return Response.json({},);
    };
    await (chatUtilsGallery as any).loadGalleryAssets.call(ctx,);
    await (chatUtilsGallery as any).loadMoreGalleryAssets.call(ctx,);
    expect(called,).toBe(false,);
  });

  test("appends the next page deduplicated and advances the cursor", async () => {
    const ctx: any = { ...makeGalleryCtx(), galleryAssets: [{ id: "a", },], galleryTotal: 3, };
    (globalThis as any).apiFetch = async () =>
      Response.json({ data: [{ id: "a", }, { id: "b", },], pagination: { total: 3, }, },);
    await (chatUtilsGallery as any).loadMoreGalleryAssets.call(ctx,);
    expect(ctx.galleryAssets,).toEqual([{ id: "a", }, { id: "b", },],);
    expect(ctx.galleryPage,).toBe(2,);
  });

  test("skips the fetch when everything is already loaded", async () => {
    const ctx: any = { ...makeGalleryCtx(), galleryAssets: [{ id: "a", },], galleryTotal: 1, };
    let called = false;
    (globalThis as any).apiFetch = async () => {
      called = true;
      return Response.json({},);
    };
    await (chatUtilsGallery as any).loadMoreGalleryAssets.call(ctx,);
    expect(called,).toBe(false,);
    expect(ctx.galleryPage,).toBe(1,);
  });

  test("delete closes the preview and refreshes the sidebar", async () => {
    const ctx: any = { ...makeGalleryCtx(), previewMediaAsset: { id: "a", }, };
    (globalThis as any).deleteAssetPreview = async () => true;
    (globalThis as any).apiFetch = async () => Response.json({ data: [], pagination: { total: 0, }, },);
    await (chatUtilsGallery as any).deletePreviewAsset.call(ctx,);
    expect(ctx.previewMediaAsset,).toBeNull();
    expect(ctx.galleryAssets,).toEqual([],);
  });

  test("delete keeps the preview open when deletion is declined", async () => {
    const ctx: any = { ...makeGalleryCtx(), previewMediaAsset: { id: "a", }, };
    (globalThis as any).deleteAssetPreview = async () => false;
    await (chatUtilsGallery as any).deletePreviewAsset.call(ctx,);
    expect(ctx.previewMediaAsset,).toEqual({ id: "a", },);
  });
});

// ── openMediaPreview — window.open for images only ──────────

describe("openMediaPreview", () => {
  const realWindow = (globalThis as { window?: unknown }).window;
  afterEach(() => {
    (globalThis as { window?: unknown }).window = realWindow;
  },);

  test("opens the asset URL in a new tab for images", () => {
    const opened: unknown[][] = [];
    (globalThis as any).window = {
      open: (...args: unknown[]) => {
        opened.push(args,);
      },
    };
    (chatUtilsGallery as any).openMediaPreview({ type: "image", url: "https://x/y.png", },);
    expect(opened,).toEqual([["https://x/y.png", "_blank", "noopener,noreferrer",],],);
  });

  test("does nothing for non-image assets", () => {
    const opened: unknown[][] = [];
    (globalThis as any).window = {
      open: (...args: unknown[]) => {
        opened.push(args,);
      },
    };
    (chatUtilsGallery as any).openMediaPreview({ type: "video", url: "https://x/v.mp4", },);
    expect(opened,).toEqual([],);
  });
});

// ── openAssetPreview — fallback chains and the global mirror ──

describe("openAssetPreview — fallbacks", () => {
  function makeCtx() {
    return { previewMediaAsset: null as any, };
  }

  test("falls back to name when filename is absent", () => {
    const c = makeCtx();
    (chatUtilsGallery as any).openAssetPreview.call(c, { id: "a1", name: "Hero", },);
    expect(c.previewMediaAsset.filename,).toBe("Hero",);
    expect(c.previewMediaAsset.caption,).toBe("Hero",);
  });

  test("defaults type to image when asset_type is absent", () => {
    const c = makeCtx();
    (chatUtilsGallery as any).openAssetPreview.call(c, { id: "a2", filename: "f.png", },);
    expect(c.previewMediaAsset.type,).toBe("image",);
  });

  test("uses the i18n fallback when filename and name are absent", () => {
    const c = makeCtx();
    (chatUtilsGallery as any).openAssetPreview.call(c, { id: "a3", },);
    expect(typeof c.previewMediaAsset.filename,).toBe("string",);
    expect(c.previewMediaAsset.filename.length,).toBeGreaterThan(0,);
  });

  test("does nothing when the asset is null", () => {
    const c = makeCtx();
    (chatUtilsGallery as any).openAssetPreview.call(c, null,);
    expect(c.previewMediaAsset,).toBeNull();
  });

  test("mirrors the asset into globalThis.__previewAsset", () => {
    const c = makeCtx();
    (chatUtilsGallery as any).openAssetPreview.call(c, {
      id: "a4",
      filename: "f.png",
      mime_type: "image/png",
      size_bytes: 10,
      width: 5,
      height: 5,
    },);
    const mirror = (globalThis as any).__previewAsset;
    expect(mirror,).not.toBeNull();
    expect(mirror.id,).toBe("a4",);
    expect(mirror.filename,).toBe("f.png",);
    expect(mirror.mime_type,).toBe("image/png",);
    expect(mirror.size_bytes,).toBe(10,);
    expect(mirror.asset_type,).toBeUndefined(); // mirror carries no width/height
    // __previewAsset is installed app-wide by src/frontend/asset-preview.ts and
    // src/frontend/alpine/chat-utils/gallery.ts. Restore the load-time value
    // rather than deleting it, so later files in a shared process keep it.
    (globalThis as { __previewAsset?: unknown }).__previewAsset = realPreviewAsset;
  });
});

// ── getMediaStyle — zero dimensions ──────────────────────────

describe("getMediaStyle — zero dimensions", () => {
  test("treats zero width/height as missing", () => {
    const style = (chatUtilsGallery as any).getMediaStyle({ type: "image", width: 0, height: 0, }, 1,);
    expect(style,).toEqual({},);
  });
});

// ── gallery network edges — envelope, pagination, throw ──────

describe("gallery network edges", () => {
  const realApiFetch = (globalThis as { apiFetch?: unknown }).apiFetch;
  afterEach(() => {
    (globalThis as any).apiFetch = realApiFetch;
  },);

  /** */
  function makeCtx(overrides: Record<string, unknown> = {},) {
    return {
      activeChat: "chat-1",
      galleryAssets: [] as { id: string }[],
      galleryPage: 1,
      galleryTotal: 0,
      ...overrides,
    };
  }

  test("loadGalleryAssets tolerates a missing data envelope", async () => {
    const c: any = makeCtx();
    (globalThis as any).apiFetch = async () => Response.json({},);
    await (chatUtilsGallery as any).loadGalleryAssets.call(c,);
    expect(c.galleryAssets,).toEqual([],);
    expect(c.galleryTotal,).toBe(0,); // falls back to the asset count
  });

  test("loadGalleryAssets falls back to the asset count without pagination", async () => {
    const c: any = makeCtx();
    (globalThis as any).apiFetch = async () => Response.json({ data: [{ id: "a", }, { id: "b", },], },);
    await (chatUtilsGallery as any).loadGalleryAssets.call(c,);
    expect(c.galleryTotal,).toBe(2,);
  });

  test("loadGalleryAssets clears the list when the fetch throws", async () => {
    const c: any = makeCtx({ galleryAssets: [{ id: "stale", },], galleryTotal: 5, },);
    (globalThis as any).apiFetch = async () => {
      throw new Error("network down",);
    };
    await (chatUtilsGallery as any).loadGalleryAssets.call(c,);
    expect(c.galleryAssets,).toEqual([],);
    expect(c.galleryTotal,).toBe(0,);
  });

  test("loadMoreGalleryAssets keeps the list when the fetch fails", async () => {
    const c: any = makeCtx({ galleryAssets: [{ id: "a", },], galleryTotal: 3, },);
    (globalThis as any).apiFetch = async () => Response.json({ error: "down", }, { status: 500, },);
    await (chatUtilsGallery as any).loadMoreGalleryAssets.call(c,);
    expect(c.galleryAssets,).toEqual([{ id: "a", },],);
    expect(c.galleryPage,).toBe(1,);
  });

  test("loadMoreGalleryAssets keeps the total when pagination is absent", async () => {
    const c: any = makeCtx({ galleryAssets: [{ id: "a", },], galleryTotal: 3, },);
    (globalThis as any).apiFetch = async () => Response.json({ data: [{ id: "b", },], },);
    await (chatUtilsGallery as any).loadMoreGalleryAssets.call(c,);
    expect(c.galleryAssets,).toEqual([{ id: "a", }, { id: "b", },],);
    expect(c.galleryTotal,).toBe(3,);
  });

  test("loadMoreGalleryAssets keeps the list when the fetch throws", async () => {
    const c: any = makeCtx({ galleryAssets: [{ id: "a", },], galleryTotal: 3, },);
    (globalThis as any).apiFetch = async () => {
      throw new Error("network down",);
    };
    await (chatUtilsGallery as any).loadMoreGalleryAssets.call(c,);
    expect(c.galleryAssets,).toEqual([{ id: "a", },],);
    expect(c.galleryPage,).toBe(1,);
  });
});

// ── uploadChatAssets — guard and failure edges ───────────────

describe("uploadChatAssets — edges", () => {
  const realApiFetch = (globalThis as { apiFetch?: unknown }).apiFetch;
  let calls: { url: string; opts: RequestInit }[] = [];
  afterEach(() => {
    (globalThis as any).apiFetch = realApiFetch;
    calls = [];
  },);

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
  function installApiFetch(handler: (url: string, opts: RequestInit,) => Promise<Response> | Response,) {
    calls = [];
    (globalThis as any).apiFetch = async (url: string, opts?: RequestInit,) => {
      const init = opts ?? {};
      calls.push({ url, opts: init, },);
      return handler(url, init,);
    };
  }

  test("warns and skips when there is no active chat", async () => {
    const { ctx, toasts, } = makeUploadCtx();
    ctx.activeChat = "";
    const { event, } = makeFileEvent(["a.png",],);
    await (chatUtilsGallery as any).uploadChatAssets.call(ctx, event,);
    expect(calls,).toEqual([],);
    expect(toasts.length,).toBe(1,);
    expect(toasts[0]!.type,).toBe("warning",);
    expect(ctx.galleryReloads,).toBe(0,);
  });

  test("returns early when the file list is empty", async () => {
    const { ctx, } = makeUploadCtx();
    const input = { files: [], value: "dirty", };
    await (chatUtilsGallery as any).uploadChatAssets.call(ctx, { target: input, } as unknown as Event,);
    expect(calls,).toEqual([],);
    expect(ctx.galleryReloads,).toBe(0,);
  });

  test("toasts an error when the link call fails after a successful upload", async () => {
    const { ctx, toasts, } = makeUploadCtx();
    installApiFetch((url,) => {
      if (url === "/api/v1/assets") { return Response.json({ id: "a1", }, { status: 200, },); }
      return Response.json({ error: "link down", }, { status: 500, },);
    },);
    const { event, } = makeFileEvent(["a.png",],);
    await (chatUtilsGallery as any).uploadChatAssets.call(ctx, event,);
    expect(calls.filter((c,) => c.url === "/api/v1/assets").length,).toBe(1,);
    expect(calls.filter((c,) => c.url.endsWith("/links",)).length,).toBe(1,);
    expect(toasts.filter((t,) => t.type === "error").length,).toBe(1,);
    expect(ctx.galleryReloads,).toBe(1,);
  });

  test("toasts a network error when the upload fetch throws", async () => {
    const { ctx, toasts, } = makeUploadCtx();
    installApiFetch(() => {
      throw new Error("network down",);
    },);
    const { event, } = makeFileEvent(["a.png",],);
    await (chatUtilsGallery as any).uploadChatAssets.call(ctx, event,);
    expect(toasts.length,).toBe(1,);
    expect(toasts[0]!.type,).toBe("error",);
    expect(ctx.galleryReloads,).toBe(1,);
  });
});

// ── loadCharacterInfo — silent character fetch ───────────────

describe("loadCharacterInfo", () => {
  const realApiFetch = (globalThis as { apiFetch?: unknown }).apiFetch;
  afterEach(() => {
    (globalThis as any).apiFetch = realApiFetch;
  },);

  test("no-ops without an active chat", async () => {
    const ctx: any = { activeChat: null, currentCharacter: null, };
    let called = false;
    (globalThis as any).apiFetch = async () => {
      called = true;
      return Response.json({},);
    };
    await (chatUtilsGallery as any).loadCharacterInfo.call(ctx,);
    expect(called,).toBe(false,);
  });

  test("loads the character linked to the active chat", async () => {
    const ctx: any = { activeChat: "chat-1", currentCharacter: null, };
    (globalThis as any).apiFetch = async (url: string,) => {
      if (url === "/api/v1/chats/chat-1") { return Response.json({ character_id: "char-9", },); }
      return Response.json({ id: "char-9", name: "Aria", },);
    };
    await (chatUtilsGallery as any).loadCharacterInfo.call(ctx,);
    expect(ctx.currentCharacter,).toEqual({ id: "char-9", name: "Aria", },);
  });

  test("skips the actor fetch when the chat has no character_id", async () => {
    const ctx: any = { activeChat: "chat-1", currentCharacter: null, };
    const urls: string[] = [];
    (globalThis as any).apiFetch = async (url: string,) => {
      urls.push(url,);
      return Response.json({ id: "chat-1", },);
    };
    await (chatUtilsGallery as any).loadCharacterInfo.call(ctx,);
    expect(urls,).toEqual(["/api/v1/chats/chat-1",],);
    expect(ctx.currentCharacter,).toBeNull();
  });

  test("stays silent when the chat fetch fails", async () => {
    const ctx: any = { activeChat: "chat-1", currentCharacter: null, };
    (globalThis as any).apiFetch = async () => Response.json({ error: "x", }, { status: 500, },);
    await (chatUtilsGallery as any).loadCharacterInfo.call(ctx,);
    expect(ctx.currentCharacter,).toBeNull();
  });

  test("stays silent when the actor fetch fails", async () => {
    const ctx: any = { activeChat: "chat-1", currentCharacter: null, };
    (globalThis as any).apiFetch = async (url: string,) => {
      if (url === "/api/v1/chats/chat-1") { return Response.json({ character_id: "c9", },); }
      return Response.json({ error: "x", }, { status: 500, },);
    };
    await (chatUtilsGallery as any).loadCharacterInfo.call(ctx,);
    expect(ctx.currentCharacter,).toBeNull();
  });

  test("stays silent when the fetch throws", async () => {
    const ctx: any = { activeChat: "chat-1", currentCharacter: null, };
    (globalThis as any).apiFetch = async () => {
      throw new Error("down",);
    };
    await (chatUtilsGallery as any).loadCharacterInfo.call(ctx,);
    expect(ctx.currentCharacter,).toBeNull();
  });
});
