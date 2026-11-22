// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Regression: generation submits must carry a minted idempotency key so a
 * retried POST coalesces server-side instead of firing a duplicate paid render.
 *
 * Exercises the real dispatchGenerationAction -> apiFetch -> feFetch -> fetch
 * chain against a stubbed globalThis.fetch and inspects the emitted header.
 * htmx.ts installs document listeners at import time, so stubs are installed
 * before the query-busted dynamic import (same pattern as htmx.test.ts).
 * No mock.module — that would leak across sibling test files.
 */

import { afterEach, beforeEach, describe, expect, it, } from "bun:test";

type FetchCall = { url: string; init?: RequestInit };

type DispatchGenerationAction = (
  ctx: { connectGenerationSSE: (chatId: string,) => void },
  endpoint: string,
  body: Record<string, unknown>,
  label: string,
  chatId: string,
) => Promise<boolean>;

const globalObj = globalThis as unknown as {
  fetch?: (url: string, init?: RequestInit,) => Promise<Response>;
  document?: unknown;
  addEventListener?: unknown;
  location?: unknown;
};

const originalFetch = globalObj.fetch;
const originalDocument = globalObj.document;
const originalAddEventListener = globalObj.addEventListener;
const originalLocation = globalObj.location;

let fetchCalls: FetchCall[] = [];

beforeEach(() => {
  fetchCalls = [];
  globalObj.fetch = (url: string, init?: RequestInit,) => {
    fetchCalls.push({ url, init, },);
    return Promise.resolve(new Response("ok", { status: 200, },),);
  };

  globalObj.document = {
    cookie: "",
    addEventListener() {},
    querySelector: () => null,
  };

  globalObj.addEventListener = () => {};
  globalObj.location = { pathname: "/chat", search: "", assign: () => {}, };
},);

afterEach(() => {
  globalObj.fetch = originalFetch;
  globalObj.document = originalDocument;
  globalObj.addEventListener = originalAddEventListener;
  globalObj.location = originalLocation;
},);

describe("dispatchGenerationAction", () => {
  it("mints a non-empty Idempotency-Key header on the generation POST", async () => {
    // Static import cannot work: htmx.ts registers document listeners at module
    // load, before this suite's beforeEach stubs exist (test-module boundary).
    const spec = `./generation-helpers.ts?fresh=submit-idem`;
    const mod = await import(spec) as { dispatchGenerationAction: DispatchGenerationAction };

    const ok = await mod.dispatchGenerationAction(
      { connectGenerationSSE: () => {}, },
      "/api/v1/generation/generate",
      { prompt: "a cat", },
      "Image",
      "chat-1",
    );

    expect(ok,).toBe(true,);
    expect(fetchCalls.length,).toBe(1,);
    const headers = fetchCalls[0]?.init?.headers as Headers;
    const key = headers.get("Idempotency-Key",);
    expect(typeof key,).toBe("string",);
    expect(key!.length,).toBeGreaterThan(0,);
  });
});
