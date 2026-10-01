// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, beforeEach, expect, mock, test, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../../test-utils/isolate-only";
import { messageSearch, } from "./message-search";

// ── Mock apiFetch (message-search imports ./htmx) ──
// DOM-touching highlight/scroll helpers are stubbed per-context below, so no
// document stubbing is needed and CSS.escape is never reached.
let fetchCalls: { url: string; opts: RequestInit }[] = [];
let fetchHandler: ((url: string, opts: RequestInit,) => Response) | null = null;

if (ISOLATED) {
  mock.module("./htmx", () => ({
    apiFetch: async (url: string, opts?: RequestInit,) => {
      fetchCalls.push({ url, opts: opts ?? {}, },);
      if (!fetchHandler) { return new Response("{}", { status: 200, },); }
      return fetchHandler(url, opts ?? {},);
    },
  }),);
}

function mockFetch(status: number, body: unknown = {},): void {
  fetchHandler = () => Response.json(body, { status, },);
}

beforeEach(() => {
  fetchCalls = [];
  fetchHandler = null;
},);

afterEach(() => {
  fetchCalls = [];
  fetchHandler = null;
},);

function searchCtx(overrides: Record<string, unknown> = {},): Record<string, unknown> {
  return {
    activeChat: "chat-1",
    _msgSearchOpen: true,
    _msgSearchQuery: "",
    _msgSearchMatches: [],
    _msgSearchTotal: 0,
    _msgSearchIndex: 0,
    _msgSearchLoading: false,
    _msgSearchDebounce: null,
    $refs: {},
    applyMessageSearchHighlights: mock(() => {},),
    applySearchMatchActive: mock(() => {},),
    scrollToSearchMatch: mock(() => {},),
    ...overrides,
  };
}

describeOrSkip("messageSearch.runMessageSearch", () => {
  test("returns early without an active chat", async () => {
    const ctx = searchCtx({ activeChat: null, _msgSearchQuery: "hi", },);
    await messageSearch.runMessageSearch!.call(ctx,);
    expect(fetchCalls,).toHaveLength(0,);
  });

  test("clears matches on a blank query", async () => {
    const ctx = searchCtx({ _msgSearchQuery: "   ", _msgSearchMatches: ["m1",], _msgSearchTotal: 5, },);
    await messageSearch.runMessageSearch!.call(ctx,);
    expect(ctx._msgSearchMatches,).toEqual([],);
    expect(ctx._msgSearchTotal,).toBe(0,);
    expect(ctx._msgSearchIndex,).toBe(0,);
    expect(ctx.applyMessageSearchHighlights as ReturnType<typeof mock>,).toHaveBeenCalledTimes(1,);
    expect(fetchCalls,).toHaveLength(0,);
  });

  test("maps results and totals on success", async () => {
    mockFetch(200, { results: [{ messageId: "m1", }, { messageId: "m2", },], total: 2, },);
    const ctx = searchCtx({ _msgSearchQuery: "hello", },);
    await messageSearch.runMessageSearch!.call(ctx,);
    expect(fetchCalls[0]!.url,).toContain("/api/v1/messages/search?chatId=chat-1&q=hello&limit=50",);
    expect(ctx._msgSearchMatches,).toEqual(["m1", "m2",],);
    expect(ctx._msgSearchTotal,).toBe(2,);
    expect(ctx._msgSearchIndex,).toBe(0,);
    expect(ctx._msgSearchLoading,).toBe(false,);
    expect(ctx.applyMessageSearchHighlights as ReturnType<typeof mock>,).toHaveBeenCalledTimes(1,);
    expect(ctx.scrollToSearchMatch as ReturnType<typeof mock>,).toHaveBeenCalledWith(0,);
  });

  test("defaults the total to the match count", async () => {
    mockFetch(200, { results: [{ messageId: "m1", },], },);
    const ctx = searchCtx({ _msgSearchQuery: "x", },);
    await messageSearch.runMessageSearch!.call(ctx,);
    expect(ctx._msgSearchTotal,).toBe(1,);
  });

  test("clears matches on non-ok responses", async () => {
    mockFetch(500, {},);
    const ctx = searchCtx({ _msgSearchQuery: "x", _msgSearchMatches: ["old",], },);
    await messageSearch.runMessageSearch!.call(ctx,);
    expect(ctx._msgSearchMatches,).toEqual([],);
    expect(ctx._msgSearchTotal,).toBe(0,);
    expect(ctx._msgSearchLoading,).toBe(false,);
  });

  test("clears matches on network error", async () => {
    fetchHandler = () => {
      throw new Error("offline",);
    };
    const ctx = searchCtx({ _msgSearchQuery: "x", },);
    await messageSearch.runMessageSearch!.call(ctx,);
    expect(ctx._msgSearchMatches,).toEqual([],);
    expect(ctx._msgSearchLoading,).toBe(false,);
  });

  test("encodes chat ids and unicode queries", async () => {
    mockFetch(200, { results: [], total: 0, },);
    const ctx = searchCtx({ activeChat: "chat/1", _msgSearchQuery: "酒場", },);
    await messageSearch.runMessageSearch!.call(ctx,);
    expect(fetchCalls[0]!.url,).toContain(`chatId=${encodeURIComponent("chat/1",)}`,);
    expect(fetchCalls[0]!.url,).toContain(`q=${encodeURIComponent("酒場",)}`,);
  });
},);

describeOrSkip("messageSearch navigation", () => {
  test("next wraps around the match list", () => {
    const ctx = searchCtx({ _msgSearchMatches: ["a", "b",], _msgSearchIndex: 1, },);
    messageSearch.nextMessageMatch!.call(ctx,);
    expect(ctx._msgSearchIndex,).toBe(0,);
    expect(ctx.scrollToSearchMatch as ReturnType<typeof mock>,).toHaveBeenCalledWith(0,);
  });

  test("prev wraps around the match list", () => {
    const ctx = searchCtx({ _msgSearchMatches: ["a", "b",], _msgSearchIndex: 0, },);
    messageSearch.prevMessageMatch!.call(ctx,);
    expect(ctx._msgSearchIndex,).toBe(1,);
  });

  test("next and prev ignore empty match lists", () => {
    const ctx = searchCtx({ _msgSearchMatches: [], _msgSearchIndex: 0, },);
    messageSearch.nextMessageMatch!.call(ctx,);
    messageSearch.prevMessageMatch!.call(ctx,);
    expect(ctx._msgSearchIndex,).toBe(0,);
    expect(ctx.scrollToSearchMatch as ReturnType<typeof mock>,).not.toHaveBeenCalled();
  });

  test("Enter advances, Shift+Enter goes back", () => {
    const next = mock(() => {},);
    const prev = mock(() => {},);
    const ctx = searchCtx({ nextMessageMatch: next, prevMessageMatch: prev, },);
    messageSearch.onMessageSearchEnter!.call(ctx, { shiftKey: false, } as KeyboardEvent,);
    expect(next,).toHaveBeenCalledTimes(1,);
    messageSearch.onMessageSearchEnter!.call(ctx, { shiftKey: true, } as KeyboardEvent,);
    expect(prev,).toHaveBeenCalledTimes(1,);
  });
},);

describeOrSkip("messageSearch open/close", () => {
  test("closeMessageSearch resets every field", () => {
    const ctx = searchCtx({
      _msgSearchOpen: true,
      _msgSearchQuery: "hi",
      _msgSearchMatches: ["m1",],
      _msgSearchTotal: 3,
      _msgSearchIndex: 2,
    },);
    messageSearch.closeMessageSearch!.call(ctx,);
    expect(ctx._msgSearchOpen,).toBe(false,);
    expect(ctx._msgSearchQuery,).toBe("",);
    expect(ctx._msgSearchMatches,).toEqual([],);
    expect(ctx._msgSearchTotal,).toBe(0,);
    expect(ctx._msgSearchIndex,).toBe(0,);
    expect(ctx._msgSearchDebounce,).toBeNull();
  });

  test("toggle opens, resets, and focuses the input", () => {
    let focused = 0;
    const ctx = searchCtx({
      _msgSearchOpen: false,
      $nextTick: (fn: () => void,) => {
        fn();
      },
      $refs: {
        msgSearchInput: {
          focus: () => {
            focused++;
          },
        },
      },
    },);
    messageSearch.toggleMessageSearch!.call(ctx,);
    expect(ctx._msgSearchOpen,).toBe(true,);
    expect(focused,).toBe(1,);
  });

  test("toggle closes via closeMessageSearch", () => {
    const close = mock(() => {},);
    const ctx = searchCtx({ _msgSearchOpen: true, closeMessageSearch: close, },);
    messageSearch.toggleMessageSearch!.call(ctx,);
    expect(close,).toHaveBeenCalledTimes(1,);
  });

  test("onMessageSearchInput debounces the search", async () => {
    const ctx = searchCtx({ _msgSearchQuery: "x", },);
    let runs = 0;
    (ctx as Record<string, unknown>).runMessageSearch = () => {
      runs++;
    };
    messageSearch.onMessageSearchInput!.call(ctx,);
    expect(ctx._msgSearchDebounce,).not.toBeNull();
    // Poll for the debounced run instead of a fixed sleep: under full-suite
    // load a 300ms timer can fire well past a fixed 350ms wait (flake).
    const deadline = Date.now() + 10_000;
    while (runs === 0 && Date.now() < deadline) {
      await new Promise<void>((resolve,) => setTimeout(resolve, 25,));
    }
    expect(runs,).toBe(1,);
    messageSearch.closeMessageSearch!.call(ctx,);
    expect(ctx._msgSearchDebounce,).toBeNull();
  });

  test("rapid input coalesces into a single search", async () => {
    const ctx = searchCtx({ _msgSearchQuery: "x", },);
    let runs = 0;
    (ctx as Record<string, unknown>).runMessageSearch = () => {
      runs++;
    };
    messageSearch.onMessageSearchInput!.call(ctx,);
    messageSearch.onMessageSearchInput!.call(ctx,);
    messageSearch.onMessageSearchInput!.call(ctx,);
    const deadline = Date.now() + 10_000;
    while (runs === 0 && Date.now() < deadline) {
      await new Promise<void>((resolve,) => setTimeout(resolve, 25,));
    }
    expect(runs,).toBe(1,);
    messageSearch.closeMessageSearch!.call(ctx,);
  });
},);

// ── Fake DOM for the real highlight/scroll helpers ──
// bun test has no DOM and no CSS.escape; install identity stubs (same
// convention as chat-variants.test.ts / gallery-upload.test.ts).
const domHost = globalThis as unknown as {
  CSS?: unknown;
  document?: {
    querySelectorAll: (selector: string,) => unknown[];
    querySelector: (selector: string,) => unknown;
  };
};
const realCss = domHost.CSS;
const realDocument = domHost.document;

function fakeElement(initialClasses: string[] = [],): {
  classes: Set<string>;
  classList: { add: (c: string,) => void; remove: (c: string,) => void };
  scrollIntoView: ReturnType<typeof mock>;
} {
  const classes = new Set<string>(initialClasses,);
  return {
    classes,
    classList: {
      add: (c: string,) => {
        classes.add(c,);
      },
      remove: (c: string,) => {
        classes.delete(c,);
      },
    },
    scrollIntoView: mock(() => {},),
  };
}

/** Fake query scope: selector → elements map, like a DOM element. */
function fakeScope(elements: Record<string, unknown[]> = {},): {
  querySelectorAll: ReturnType<typeof mock>;
  querySelector: ReturnType<typeof mock>;
} {
  return {
    querySelectorAll: mock((sel: string,) => elements[sel] ?? []),
    querySelector: mock((sel: string,) => elements[sel]?.[0] ?? null),
  };
}

/** Context without the highlight helpers mocked, so the real impls run. */
function rawCtx(overrides: Record<string, unknown> = {},): Record<string, unknown> {
  return {
    activeChat: "chat-1",
    _msgSearchOpen: true,
    _msgSearchQuery: "",
    _msgSearchMatches: [],
    _msgSearchTotal: 0,
    _msgSearchIndex: 0,
    _msgSearchLoading: false,
    _msgSearchDebounce: null,
    $refs: {},
    applyMessageSearchHighlights: mock(() => {},),
    applySearchMatchActive: mock(() => {},),
    ...overrides,
  };
}

describeOrSkip("messageSearch highlight helpers (real implementations)", () => {
  beforeEach(() => {
    domHost.CSS = { escape: (value: string,) => value, };
  },);

  afterEach(() => {
    domHost.CSS = realCss;
    domHost.document = realDocument;
  },);

  test("applyMessageSearchHighlights marks matches and clears the active class", () => {
    const active = fakeElement(["search-match-active",],);
    const match = fakeElement();
    const scope = fakeScope({
      ".search-match-active": [active,],
      '[data-message-id="m1"]': [match,],
    },);
    const applyActive = mock(() => {},);
    const ctx = rawCtx({
      _msgSearchMatches: ["m1",],
      $refs: { messageList: scope, },
      applySearchMatchActive: applyActive,
    },);
    messageSearch.applyMessageSearchHighlights!.call(ctx,);
    expect(active.classes.has("search-match-active",),).toBe(false,);
    expect(match.classes.has("search-match",),).toBe(true,);
    expect(applyActive,).toHaveBeenCalledTimes(1,);
  });

  test("applyMessageSearchHighlights clears stale highlights when no matches", () => {
    const stale = fakeElement(["search-match",],);
    const scope = fakeScope({ ".search-match": [stale,], },);
    const ctx = rawCtx({ _msgSearchMatches: [], $refs: { messageList: scope, }, },);
    messageSearch.applyMessageSearchHighlights!.call(ctx,);
    expect(stale.classes.has("search-match",),).toBe(false,);
  });

  test("applyMessageSearchHighlights falls back to document without $refs.messageList", () => {
    const match = fakeElement();
    domHost.document = {
      querySelectorAll: (sel: string,) => (sel === '[data-message-id="m1"]' ? [match,] : []),
      querySelector: () => null,
    };
    const ctx = rawCtx({ _msgSearchMatches: ["m1",], $refs: {}, },);
    messageSearch.applyMessageSearchHighlights!.call(ctx,);
    expect(match.classes.has("search-match",),).toBe(true,);
  });

  test("applySearchMatchActive adds the active class to the current match", () => {
    const el = fakeElement();
    const scope = fakeScope({ '[data-message-id="m2"]': [el,], },);
    const ctx = rawCtx({ _msgSearchMatches: ["m1", "m2",], _msgSearchIndex: 1, $refs: { messageList: scope, }, },);
    messageSearch.applySearchMatchActive!.call(ctx,);
    expect(el.classes.has("search-match-active",),).toBe(true,);
  });

  test("applySearchMatchActive no-ops on an empty match list", () => {
    const scope = fakeScope();
    const ctx = rawCtx({ _msgSearchMatches: [], $refs: { messageList: scope, }, },);
    messageSearch.applySearchMatchActive!.call(ctx,);
    expect(scope.querySelector,).not.toHaveBeenCalled();
  });

  test("scrollToSearchMatch scrolls the matched bubble into view", () => {
    const el = fakeElement();
    const scope = fakeScope({ '[data-message-id="m1"]': [el,], },);
    const ctx = rawCtx({ _msgSearchMatches: ["m1",], $refs: { messageList: scope, }, },);
    messageSearch.scrollToSearchMatch!.call(ctx, 0,);
    expect(el.scrollIntoView,).toHaveBeenCalledWith({ behavior: "smooth", block: "center", },);
  });

  test("scrollToSearchMatch no-ops on an out-of-range index", () => {
    const scope = fakeScope();
    const ctx = rawCtx({ _msgSearchMatches: ["m1",], $refs: { messageList: scope, }, },);
    messageSearch.scrollToSearchMatch!.call(ctx, 5,);
    expect(scope.querySelector,).not.toHaveBeenCalled();
  });
},);

describeOrSkip("messageSearch toggle optional chains", () => {
  test("opens without $nextTick or a search input", () => {
    const ctx = rawCtx({ _msgSearchOpen: false, $refs: {}, },);
    messageSearch.toggleMessageSearch!.call(ctx,);
    expect(ctx._msgSearchOpen,).toBe(true,);
  });

  test("opens without a msgSearchInput ref", () => {
    let ticked = 0;
    const ctx = rawCtx({
      _msgSearchOpen: false,
      $refs: {},
      $nextTick: (fn: () => void,) => {
        ticked++;
        fn();
      },
    },);
    messageSearch.toggleMessageSearch!.call(ctx,);
    expect(ctx._msgSearchOpen,).toBe(true,);
    expect(ticked,).toBe(1,);
  });
},);

describeOrSkip("messageSearch global toggle", () => {
  const g = globalThis as Record<string, unknown>;
  let realAlpine: unknown;

  beforeEach(() => {
    domHost.CSS = { escape: (value: string,) => value, };
    realAlpine = g.Alpine;
    domHost.document = { querySelector: () => null, querySelectorAll: () => [], };
  },);

  afterEach(() => {
    domHost.CSS = realCss;
    domHost.document = realDocument;
    if (realAlpine === undefined) {
      delete g.Alpine;
    } else {
      g.Alpine = realAlpine;
    }
  },);

  test("no-ops when no chatState element exists", () => {
    const qs = mock((_sel: string,) => null);
    domHost.document = { querySelector: qs, querySelectorAll: () => [], };
    (g.toggleMessageSearch as () => void)();
    expect(qs,).toHaveBeenCalledWith("[x-data='chatState()']",);
  });

  test("no-ops when Alpine is undefined", () => {
    const qs = mock((_sel: string,) => ({}));
    domHost.document = { querySelector: qs, querySelectorAll: () => [], };
    delete g.Alpine;
    (g.toggleMessageSearch as () => void)();
    expect(qs,).toHaveBeenCalledWith("[x-data='chatState()']",);
  });

  test("dispatches through Alpine.$data", () => {
    const fn = mock(() => {},);
    const data = { toggleMessageSearch: fn, };
    const el = {};
    const qs = mock((_sel: string,) => el);
    domHost.document = { querySelector: qs, querySelectorAll: () => [], };
    g.Alpine = { $data: (e: unknown,) => (e === el ? data : {}), };
    (g.toggleMessageSearch as () => void)();
    expect(fn,).toHaveBeenCalledTimes(1,);
  });

  test("no-ops when the component toggle is not a function", () => {
    const el = {};
    const $data = mock(() => ({ toggleMessageSearch: "nope", }));
    domHost.document = { querySelector: () => el, querySelectorAll: () => [], };
    g.Alpine = { $data, };
    (g.toggleMessageSearch as () => void)();
    expect($data,).toHaveBeenCalledWith(el,);
  });
},);
