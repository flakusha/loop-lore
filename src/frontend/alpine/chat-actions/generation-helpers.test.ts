// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Regression: BOTH idempotency-sensitive command actions must carry a minted
 * key so a retried request coalesces server-side instead of duplicating work:
 * - dispatchGenerationAction POSTs a paid generation (duplicate render risk);
 * - dispatchQuestAction POSTs a create-quest after a world_id lookup GET.
 *
 * Exercises the real dispatch* -> apiFetch -> feFetch -> safeFetch -> fetch
 * chain against a stubbed globalThis.fetch and inspects the emitted header.
 * htmx.ts installs document listeners at import time, so stubs are installed
 * before the query-busted dynamic imports (same pattern as htmx.test.ts).
 * Each import uses a distinct fresh token because the two tests share the
 * module registry — a repeated spec URL would return a cached module. No
 * mock.module — that would leak across sibling test files.
 */

import { afterEach, beforeEach, describe, expect, it, } from "bun:test";

type FetchCall = { url: string; init?: RequestInit };

type DispatchCtx = {
  $dispatch?: (event: string, detail: Record<string, unknown>,) => void;
  connectGenerationSSE: (chatId: string,) => void;
};

type GenerationHelpers = {
  dispatchGenerationAction: (
    ctx: DispatchCtx,
    endpoint: string,
    body: Record<string, unknown>,
    label: string,
    chatId: string,
  ) => Promise<boolean>;
  dispatchQuestAction: (ctx: DispatchCtx, description: string, chatId: string,) => Promise<void>;
};

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
    if (url.includes("/api/v1/chats/",)) {
      return Promise.resolve(Response.json({ world_id: "world-1", }, { status: 200, },),);
    }

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

describe("generation-helpers idempotency", () => {
  it("mints a non-empty Idempotency-Key header on the generation POST", async () => {
    // Static import cannot work: htmx.ts registers document listeners at module
    // load, before this suite's beforeEach stubs exist (test-module boundary).
    const spec = `./generation-helpers.ts?fresh=idem-merged-gen`;
    const mod = await import(spec) as GenerationHelpers;

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
    questKeyFromOtherTest = key ?? undefined;
  });

  it("mints a non-empty Idempotency-Key header on the quest POST (and none on the lookup GET)", async () => {
    const spec = `./generation-helpers.ts?fresh=idem-merged-quest`;
    const mod = await import(spec) as GenerationHelpers;

    const toasts: string[] = [];
    await mod.dispatchQuestAction(
      {
        $dispatch: (event: string,) => {
          toasts.push(event,);
        },
        connectGenerationSSE: () => {},
      },
      "Write a quest",
      "chat-1",
    );

    expect(toasts,).toContain("show-toast",);
    expect(fetchCalls.length,).toBe(2,);

    const get = fetchCalls[0];
    expect(get?.url,).toContain("/api/v1/chats/chat-1",);
    expect((get?.init?.headers as Headers).get("Idempotency-Key",),).toBeNull();

    const post = fetchCalls[1];
    expect(post?.init?.method,).toBe("POST",);
    expect(post?.url,).toContain("/api/v1/worlds/world-1/quests",);
    const headers = post?.init?.headers as Headers;
    const key = headers.get("Idempotency-Key",);
    expect(typeof key,).toBe("string",);
    expect(key!.length,).toBeGreaterThan(0,);
    // Keys are minted per request, so the two POSTs in this file never share one.
    expect(key!,).not.toBe(questKeyFromOtherTest,);
  });
});

// Set by the generation test above; proves the quest POST mints its own key.
let questKeyFromOtherTest: string | undefined;
