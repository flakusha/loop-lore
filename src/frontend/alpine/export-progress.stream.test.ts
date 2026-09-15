// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Regression: export-progress's SSE path must stream through the real
// feFetch → safeFetch stack, not buffer the body (safeFetch's parseJson:false
// used to `await response.text()`, which only resolves when the stream closes)
// and not abort on the 30s default timeout (the export stream stays open for
// the whole job). This file mocks globalThis.fetch — the lowest seam — so the
// whole call chain is exercised, unlike export-progress.test.ts which mocks
// ./htmx above the breakage.
import { afterEach, expect, test, } from "bun:test";
import { exportProgressFactory, } from "./export-progress";

const originalFetch = globalThis.fetch;
const g = globalThis as unknown as {
  localStorage?: Storage;
};

afterEach(() => {
  globalThis.fetch = originalFetch;
  g.localStorage = undefined;
},);

/** A live SSE Response that never closes until the caller cancels it. */
function openSse(frames: string[],): { response: Response; closed: boolean } {
  const state = { closed: false, cursor: 0, };
  const stream = new ReadableStream<Uint8Array>({
    pull(controller,) {
      if (state.cursor < frames.length) {
        controller.enqueue(new TextEncoder().encode(frames[state.cursor]!,),);
        state.cursor += 1;
      }
      // Deliberately do not close: a buffering client would hang forever here.
    },
    cancel() {
      state.closed = true;
    },
  },);
  return {
    response: new Response(stream, { status: 200, headers: { "Content-Type": "text/event-stream", }, },),
    get closed() {
      return state.closed;
    },
  };
}

test("startExport streams the SSE body and disarms the fetch timeout", async () => {
  const store = new Map<string, string>();
  g.localStorage = {
    getItem: (k: string,) => store.get(k,) ?? null,
    setItem: (k: string, v: string,) => void store.set(k, v,),
    removeItem: (k: string,) => void store.delete(k,),
  } as unknown as Storage;

  let captured: RequestInit | undefined;
  const stream = openSse([
    `data: {"type":"job_created","jobId":"j1","status":"queued"}\n\n`,
    `data: {"type":"completed","jobId":"j1","downloadUrl":"/api/export/download/j1"}\n\n`,
  ],);
  globalThis.fetch = (async (_input: unknown, init?: RequestInit,) => {
    captured = init;
    return stream.response;
  }) as typeof fetch;

  const ctx = exportProgressFactory();

  await ctx.startExport();

  // The stream never closes on its own, yet startExport returned: proves the
  // body was read incrementally (reader cancelled on the terminal frame),
  // not buffered via response.text().
  expect(ctx.status,).toBe("completed",);
  expect(ctx.downloadUrl,).toBe("/api/export/download/j1",);
  expect(ctx.error,).toBe("",);
  // Stream mode must not arm the 30s timeout: a bare signal (undefined)
  // means no AbortController chain from safeFetch.
  expect(captured?.signal,).toBeUndefined();
  expect(stream.closed,).toBe(true,);
});
