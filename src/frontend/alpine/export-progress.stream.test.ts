// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Regression: export-progress's SSE path must stream incrementally (not buffer
// via response.text()) and not arm the 30s safeFetch timeout (the export
// stream stays open for the whole job).
//
// Mocking strategy: production code calls `apiFetch` from ./htmx (which
// delegates to feFetch → safeFetch → globalThis.fetch). The previous version
// of this test mocked globalThis.fetch — that worked when run alone, but
// failed when sibling export-progress.test.ts ran first: that file
// `mock.module("./htmx", …)`s `apiFetch` to a `handler` variable, and the
// module mock leaks process-wide in Bun's test runner. When the leak hits,
// apiFetch bypasses globalThis.fetch entirely and returns the sibling
// test's default 404 handler → startExport resolves with status still
// "queued" and error set — the symptom reported in
// BUG-export-progress-stream-test-status-assertion-is-flaky.
//
// Fix: install our own `apiFetch` mock here so the test is hermetic
// regardless of file ordering. The captured RequestInit surfaces what
// startExport passed to the request layer; we assert `signal === undefined`
// to prove the 30s timeout is NOT armed in stream mode.
import { afterEach, expect, mock, test, } from "bun:test";
import { ISOLATED, } from "../../test-utils/isolate-only";
import { exportProgressFactory, } from "./export-progress";

type ApiFetchMock = (url: string, opts?: RequestInit,) => Promise<Response>;
let handler: ApiFetchMock = async () => new Response(null, { status: 404, },);

// Mirror export-progress.test.ts: static import first (hoisted), then patch
// the ./htmx module cache via mock.module. Bun looks up cached modules at
// call-time, so the mock takes effect for startExport's apiFetch call even
// though the static import resolved before mock.module ran.
if (ISOLATED) {
  mock.module("./htmx", () => ({
    apiFetch: ((url: string, opts?: RequestInit,) => {
      return handler(url, opts,);
    }) satisfies ApiFetchMock,
  }),);
}

afterEach(() => {
  handler = async () => new Response(null, { status: 404, },);
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

test.skipIf(!ISOLATED,)("startExport streams the SSE body and disarms the fetch timeout", async () => {
  let captured: RequestInit | undefined;
  const stream = openSse([
    `data: {"type":"job_created","jobId":"j1","status":"queued"}\n\n`,
    `data: {"type":"completed","jobId":"j1","downloadUrl":"/api/v1/export/download/j1"}\n\n`,
  ],);

  handler = async (_url: string, init?: RequestInit,) => {
    captured = init;
    return stream.response;
  };

  const ctx = exportProgressFactory();

  await ctx.startExport();

  // The stream never closes on its own, yet startExport returned: proves the
  // body was read incrementally (reader cancelled on the terminal frame),
  // not buffered via response.text().
  expect(ctx.status,).toBe("completed",);
  expect(ctx.downloadUrl,).toBe("/api/v1/export/download/j1",);
  expect(ctx.error,).toBe("",);
  // Stream mode must not arm the 30s timeout: a bare signal (undefined)
  // means no AbortController chain from safeFetch.
  expect(captured?.signal,).toBeUndefined();
  // The SSE contract: startExport must request a streaming response.
  expect((captured as { stream?: unknown } | undefined)?.stream,).toBe(true,);
  expect(stream.closed,).toBe(true,);
},);
