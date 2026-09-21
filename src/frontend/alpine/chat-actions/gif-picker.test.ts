// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import "../i18n.test-helper";
import { afterEach, beforeEach, describe, expect, mock, test, } from "bun:test";
import { gifPicker, type GifResult, } from "./gif-picker";

import type { ApiFetchMock, Toast, } from "../../tests/test-types";

// ── Mock ../htmx (must precede importing ./gif-picker usage) ──
let calls: { url: string; opts: RequestInit }[] = [];
let handler: ApiFetchMock = async () => Response.json({},);

mock.module("../htmx", () => ({
  apiFetch: (async (url: string, opts?: RequestInit,) => {
    calls.push({ url, opts: opts ?? {}, },);
    return handler(url, opts,);
  }) satisfies ApiFetchMock,
}),);

interface GifCtx {
  activeChat: string | null;
  pendingAssets: { assetId: string; filename: string }[];
  _gifOpen: boolean;
  _gifQuery: string;
  _gifResults: GifResult[];
  _gifActiveIndex: number;
  _gifLoading: boolean;
  toasts: Toast[];
  $dispatch?: (event: string, detail?: unknown,) => void;
}

function gif(id: string,): GifResult {
  return {
    id,
    title: `gif ${id}`,
    url: `https://media.example/${id}.gif`,
    previewUrl: `https://media.example/${id}-tiny.gif`,
    width: 200,
    height: 150,
  };
}

function buildCtx(overrides?: Partial<GifCtx>,): GifCtx {
  const ctx: GifCtx = {
    activeChat: "chat-1",
    pendingAssets: [],
    _gifOpen: false,
    _gifQuery: "",
    _gifResults: [],
    _gifActiveIndex: 0,
    _gifLoading: false,
    toasts: [],
    $dispatch: (event, detail,) => {
      if (event === "show-toast") {
        ctx.toasts.push(detail as Toast,);
      }
    },
    ...overrides,
  };
  // Merge the module's own methods so sibling calls (handleGifKey →
  // moveGifSelection/closeGifPicker/insertGifAtIndex) resolve, mirroring
  // the Alpine merge at runtime. Data fields above win over defaults.
  return { ...gifPicker, ...ctx, };
}

function keyEvent(key: string,): KeyboardEvent {
  return { key, preventDefault: () => {}, } as KeyboardEvent;
}

const originalFetch = globalThis.fetch;
let fetchHandler: (url: string,) => Promise<Response> = async () => new Response("x",);

beforeEach(() => {
  globalThis.fetch = ((url: unknown,) => fetchHandler(String(url,),)) as typeof fetch;
},);

afterEach(() => {
  calls = [];
  handler = async () => Response.json({},);
  fetchHandler = async () => new Response("x",);
  globalThis.fetch = originalFetch;
},);

describe("gifPicker.searchGifs", () => {
  test("renders results and resets the selection", async () => {
    const ctx = buildCtx({ _gifQuery: "cats", _gifActiveIndex: 2, },);
    handler = async () => Response.json({ data: [gif("a",), gif("b",),], },);
    await gifPicker.searchGifs!.call(ctx as never,);
    expect(calls[0]!.url,).toBe("/api/v1/gifs/search?q=cats&limit=12",);
    expect(ctx._gifResults.map((r,) => r.id),).toEqual(["a", "b",],);
    expect(ctx._gifActiveIndex,).toBe(0,);
    expect(ctx._gifLoading,).toBe(false,);
    expect(ctx.toasts,).toEqual([],);
  });

  test("skips empty queries without fetching", async () => {
    const ctx = buildCtx({ _gifQuery: "   ", },);
    await gifPicker.searchGifs!.call(ctx as never,);
    expect(calls,).toEqual([],);
    expect(ctx._gifLoading,).toBe(false,);
  });
  test("501 surfaces the not-configured info toast", async () => {
    const ctx = buildCtx({ _gifQuery: "cats", },);
    handler = async () => new Response("", { status: 501, },);
    await gifPicker.searchGifs!.call(ctx as never,);
    expect(ctx.toasts,).toEqual([{ type: "info", message: "GIF search is not configured.", },],);
    expect(ctx._gifResults,).toEqual([],);
  });
  test("429 surfaces the rate-limit error toast", async () => {
    const ctx = buildCtx({ _gifQuery: "cats", },);
    handler = async () => new Response("", { status: 429, },);
    await gifPicker.searchGifs!.call(ctx as never,);
    expect(ctx.toasts,).toEqual([{ type: "error", message: "GIF search is rate-limited. Try again shortly.", },],);
  });
  test("network failure surfaces the search-failed toast", async () => {
    const ctx = buildCtx({ _gifQuery: "cats", },);
    handler = async () => {
      throw new Error("offline",);
    };
    await gifPicker.searchGifs!.call(ctx as never,);
    expect(ctx.toasts,).toEqual([{ type: "error", message: "GIF search failed. Try again.", },],);
    expect(ctx._gifLoading,).toBe(false,);
  });
});

describe("gifPicker keyboard navigation", () => {
  test("arrows wrap around the result list", () => {
    const ctx = buildCtx({ _gifOpen: true, _gifResults: [gif("a",), gif("b",), gif("c",),], _gifActiveIndex: 0, },);
    gifPicker.handleGifKey!.call(ctx as never, keyEvent("ArrowUp",),);
    expect(ctx._gifActiveIndex,).toBe(2,);
    gifPicker.handleGifKey!.call(ctx as never, keyEvent("ArrowDown",),);
    expect(ctx._gifActiveIndex,).toBe(0,);
  });

  test("keys are ignored while the picker is closed", () => {
    const ctx = buildCtx({ _gifOpen: false, _gifResults: [gif("a",),], },);
    gifPicker.handleGifKey!.call(ctx as never, keyEvent("ArrowDown",),);
    expect(ctx._gifActiveIndex,).toBe(0,);
    expect(calls,).toEqual([],);
  });

  test("escape closes the picker", () => {
    const ctx = buildCtx({ _gifOpen: true, },);
    gifPicker.handleGifKey!.call(ctx as never, keyEvent("Escape",),);
    expect(ctx._gifOpen,).toBe(false,);
  });

  test("enter inserts the highlighted result as a pending asset", async () => {
    const ctx = buildCtx({ _gifOpen: true, _gifResults: [gif("a",), gif("b",),], _gifActiveIndex: 1, },);
    fetchHandler = async () => new Response(new Uint8Array([1, 2, 3,],),);
    handler = async (url,) => url === "/api/v1/assets" ? Response.json({ id: "asset-9", },) : Response.json({},);
    gifPicker.handleGifKey!.call(ctx as never, keyEvent("Enter",),);
    await Bun.sleep(10,);
    expect(ctx.pendingAssets,).toEqual([{ assetId: "asset-9", filename: "b.gif", },],);
    expect(ctx._gifOpen,).toBe(false,);
    expect(ctx.toasts[0]!.type,).toBe("success",);
  });
});

describe("gifPicker.insertGif", () => {
  test("warns without an active chat and fetches nothing", async () => {
    const ctx = buildCtx({ activeChat: null, },);
    await gifPicker.insertGif!.call(ctx as never, gif("a",),);
    expect(ctx.toasts,).toEqual([{ type: "warning", message: "Select a chat first.", },],);
    expect(calls,).toEqual([],);
  });
  test("failed download surfaces the download toast", async () => {
    const ctx = buildCtx({ _gifOpen: true, },);
    fetchHandler = async () => new Response("", { status: 404, },);
    await gifPicker.insertGif!.call(ctx as never, gif("a",),);
    expect(ctx.toasts,).toEqual([{ type: "error", message: "Could not download that GIF.", },],);
    expect(calls,).toEqual([],);
    expect(ctx._gifOpen,).toBe(true,);
  });

  test("failed upload surfaces the server error", async () => {
    const ctx = buildCtx({ _gifOpen: true, },);
    fetchHandler = async () => new Response(new Uint8Array([1,],),);
    handler = async () => Response.json({ error: "quota exceeded", }, { status: 500, },);
    await gifPicker.insertGif!.call(ctx as never, gif("a",),);
    expect(ctx.toasts,).toEqual([{ type: "error", message: "quota exceeded", },],);
    expect(ctx.pendingAssets,).toEqual([],);
  });
  test("network failure surfaces the attach-failed toast", async () => {
    const ctx = buildCtx({ _gifOpen: true, },);
    fetchHandler = async () => {
      throw new Error("offline",);
    };
    await gifPicker.insertGif!.call(ctx as never, gif("a",),);
    expect(ctx.toasts,).toEqual([{ type: "error", message: "Could not attach a.gif.", },],);
  });
});
