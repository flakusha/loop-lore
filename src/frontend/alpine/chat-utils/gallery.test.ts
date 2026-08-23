import "../i18n.test-helper";
import { afterEach, describe, expect, mock, test, } from "bun:test";
import { chatUtilsGallery, } from "./gallery";

// gallery.ts uses `apiFetch` as a bare reference to globalThis.apiFetch (set
// at import time by htmx.ts). Override globalThis.apiFetch directly: a
// mock.module("./htmx") would not intercept the bare global binding.
let originalApiFetch: typeof globalThis.apiFetch | undefined;
let fetchCalls: { url: string; opts: RequestInit; start: number; end?: number }[] = [];
let perCall: ((url: string, callIdx: number,) => Response | Promise<Response>) | null = null;
let perCallDelayMs = 50;

function installMock(): void {
  originalApiFetch = globalThis.apiFetch;
  let callIdx = 0;
  globalThis.apiFetch = (async (url: string, opts?: RequestInit,) => {
    callIdx++;
    const idx = callIdx;
    const start = Date.now();
    const entry: { url: string; opts: RequestInit; start: number; end?: number } = { url, opts: opts ?? {}, start, };
    fetchCalls.push(entry,);
    await new Promise((r,) => setTimeout(r, perCallDelayMs,),);
    entry.end = Date.now();
    if (perCall) {
      const r = perCall(url, idx,);
      return r instanceof Promise ? r : Promise.resolve(r);
    }
    return new Response('{"id":"a-' + idx + '"}', { status: 200, },);
  }) as typeof globalThis.apiFetch;
}

function restoreMock(): void {
  if (originalApiFetch) {
    globalThis.apiFetch = originalApiFetch;
    originalApiFetch = undefined;
  }
  perCall = null;
  perCallDelayMs = 50;
}

afterEach(() => {
  fetchCalls = [];
  restoreMock();
},);

function fakeFile(name: string,): File {
  return new File([`content-${name}`], name, { type: "image/png", },);
}

function buildCtx() {
  const toasts: { type: string; message: string }[] = [];
  const ctx = {
    activeChat: "chat-1",
    galleryAssets: [] as unknown[],
    $dispatch(event: string, detail: Record<string, unknown>,) {
      if (event === "show-toast") {
        toasts.push({ type: detail.type as string, message: detail.message as string, },);
      }
    },
    loadGalleryAssets: mock(async () => {}),
    toasts,
  };
  return { ctx, toasts, };
}

describe("chatUtilsGallery.uploadChatAssets parallelization", () => {
  test("uploads run concurrently — overlapping windows, wall-clock ≈ 1× delay", async () => {
    installMock();
    perCallDelayMs = 50;
    const files = [fakeFile("a.png",), fakeFile("b.png",), fakeFile("c.png",),];
    const fileList = {
      length: files.length,
      [Symbol.iterator]: function* () { yield* files; },
      item(i: number,) { return files[i] ?? null; },
    } as unknown as FileList;
    const event = { target: { files: fileList, value: "set", }, } as unknown as Event;

    const { ctx, } = buildCtx();
    const wallStart = Date.now();
    await chatUtilsGallery.uploadChatAssets!.call(ctx as never, event,);
    const wallElapsed = Date.now() - wallStart;

    const uploads = fetchCalls.filter((c,) => c.url === "/api/assets" && c.opts.method === "POST",);
    expect(uploads.length,).toBe(3,);

    // Sequential: 50 × 3 = 150ms+. Parallel: ~50-100ms with overhead.
    expect(wallElapsed,).toBeLessThan(140,);

    // Overlap proof: latest upload's start is before the earliest end.
    const starts = uploads.map((c,) => c.start,);
    const ends = uploads.map((c,) => c.end ?? c.start,);
    const latestStart = Math.max(...starts,);
    const earliestEnd = Math.min(...ends,);
    expect(latestStart,).toBeLessThan(earliestEnd,);
  },);

  test("continues uploading other files when one fails (Promise.all isolation)", async () => {
    installMock();
    perCallDelayMs = 10;
    let postCount = 0;
    perCall = (url,) => {
      if (url === "/api/assets" || url === "/api/assets/") {
        postCount++;
        if (postCount === 2) { return new Response("boom", { status: 500, },); }
      }
      return new Response("{}", { status: 200, },);
    };

    const files = [fakeFile("a.png",), fakeFile("b.png",), fakeFile("c.png",),];
    const fileList = {
      length: files.length,
      [Symbol.iterator]: function* () { yield* files; },
      item(i: number,) { return files[i] ?? null; },
    } as unknown as FileList;
    const event = { target: { files: fileList, value: "set", }, } as unknown as Event;

    const { ctx, toasts, } = buildCtx();
    await chatUtilsGallery.uploadChatAssets!.call(ctx as never, event,);

    const uploads = fetchCalls.filter((c,) => c.url === "/api/assets" && c.opts.method === "POST",);
    expect(uploads.length,).toBe(3,);
    expect(toasts.some((t,) => t.type === "error",),).toBe(true,);
    expect(ctx.loadGalleryAssets.mock.calls.length,).toBe(1,);
  },);
});
