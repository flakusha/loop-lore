// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for frontend shared helpers: formatSize, filterActors,
 * getErrorMessage, fetchPartial, escapeHtml, filterCards, and the filterBar
 * Alpine component (tag facet included).
 *
 * `./fe-fetch` is the module seam (mocked — no network); htmx and the DOM are
 * stubbed on globalThis with listener-stashing fakes.
 */
import { afterEach, beforeEach, describe, expect, mock, test, } from "bun:test";

import type { FilterBarState, } from "./shared";

let calls: { url: string; opts?: RequestInit }[] = [];
let feHandler: ((url: string, opts?: RequestInit,) => Response) | null = null;

mock.module("../fe-fetch", () => ({
  feFetch: async (url: string, opts: RequestInit = {},) => {
    calls.push({ url, opts, },);
    if (!feHandler) { return new Response("{}", { status: 404, },); }
    return feHandler(url, opts,);
  },
  getCsrfToken: () => "",
}),);

const jsonResponse = (body: unknown, status = 200,): Response => new Response(JSON.stringify(body,), { status, },);

// ── fake DOM ────────────────────────────────────────────────

interface El {
  tagName: string;
  innerHTML: string;
  textContent: string;
  className: string;
  style: Record<string, string>;
  dataset: Record<string, string>;
  querySelector: (sel: string,) => El | null;
  querySelectorAll: (sel: string,) => El[];
  append: (child: El,) => void;
  children: El[];
  getHTML: () => string;
}

function escapeText(s: string,): string {
  return s.replace(/[&<>"']/g, (c,) => {
    switch (c) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      case "'":
        return "&#39;";
      default:
        return c;
    }
  },);
}

function makeEl(overrides: Partial<El> = {},): El {
  const el: El = {
    tagName: "div",
    innerHTML: "",
    textContent: "",
    className: "",
    style: {},
    dataset: {},
    querySelector: () => null,
    querySelectorAll: () => [],
    append: (child,) => {
      el.children.push(child,);
    },
    children: [],
    getHTML: () => escapeText(el.textContent,),
    ...overrides,
  };
  return el;
}

function makeCard(name: string, desc: string,): El {
  return makeEl({
    querySelector: (sel,) => {
      if (sel === ".name") { return makeEl({ textContent: name, },); }
      if (sel === ".desc") { return makeEl({ textContent: desc, },); }
      return null;
    },
  },);
}

interface Host {
  document?: unknown;
  htmx?: { ajax: (method: string, url: string, opts: unknown,) => void };
  filterBar?: () => FilterBarState;
}

/** Drain pending promise microtasks (mocked feFetch resolves via microtasks). */
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 16; i++) { await Promise.resolve(); }
}

const host = globalThis as unknown as Host;
const originalDocument = host.document;
const originalHtmx = host.htmx;

let htmxCalls: { method: string; url: string; opts: unknown }[] = [];

beforeEach(() => {
  calls = [];
  htmxCalls = [];
  host.htmx = {
    ajax: (method, url, opts,) => {
      htmxCalls.push({ method, url, opts, },);
    },
  };
},);

afterEach(() => {
  host.document = originalDocument;
  host.htmx = originalHtmx;
},);

interface FakeDoc {
  createElement?: () => El;
  querySelector?: (sel: string,) => El | null;
  querySelectorAll?: (sel: string,) => El[];
  append?: (child: El,) => void;
}

function installDocument(doc: FakeDoc,): void {
  host.document = doc as unknown as Document;
}

// ── pure helpers ────────────────────────────────────────────

describe("formatSize", () => {
  test("formats bytes, KB, and MB; empty for zero", async () => {
    const { formatSize, } = await import("./shared");
    expect(formatSize(0,),).toBe("",);
    expect(formatSize(512,),).toBe("512 B",);
    expect(formatSize(2048,),).toBe("2.0 KB",);
    expect(formatSize(3_145_728,),).toBe("3.0 MB",);
  });
});

describe("filterActors", () => {
  test("empty query returns nothing; matches name or description", async () => {
    const { filterActors, } = await import("./shared");
    const actors = [
      { name: "Sword", description: "sharp", },
      { display_name: "Shield", description: "sturdy", },
      { name: "Potion", description: "heals wounds", },
    ];
    expect(filterActors(actors, "   ",),).toEqual([],);
    expect(filterActors(actors, "sw",),).toEqual([actors[0],],);
    expect(filterActors(actors, "STURDY",),).toEqual([actors[1],],);
    expect(filterActors(actors, "w",),).toEqual([actors[0], actors[2],],);
  });

  test("limit caps results", async () => {
    const { filterActors, } = await import("./shared");
    const actors = Array.from({ length: 5, }, (_, i,) => ({ name: `a${i}`, description: "", }),);
    expect(filterActors(actors, "a", 3,).length,).toBe(3,);
  });
});

describe("getErrorMessage", () => {
  test("prefers message, then error, then fallback", async () => {
    const { getErrorMessage, } = await import("./shared");
    expect(await getErrorMessage(jsonResponse({ message: "m", error: "e", },), "fb",),).toBe("m",);
    expect(await getErrorMessage(jsonResponse({ error: "e", },), "fb",),).toBe("e",);
    expect(await getErrorMessage(new Response("not json", { status: 500, },), "fb",),).toBe("fb",);
  });
});

describe("fetchPartial", () => {
  test("returns text on success and null on failure", async () => {
    const { fetchPartial, } = await import("./shared");
    feHandler = (url,) => url === "/partials/ok" ? new Response("<div/>",) : new Response("{}", { status: 500, },);
    expect(await fetchPartial("/partials/ok",),).toBe("<div/>",);
    expect(await fetchPartial("/partials/bad",),).toBeNull();
    expect(calls[0]!.opts!.headers,).toEqual({ "HX-Request": "true", },);
  });
});

describe("escapeHtml / filterCards", () => {
  test("escapeHtml escapes via textContent round-trip", async () => {
    const { escapeHtml, } = await import("./shared");
    installDocument({ createElement: () => makeEl(), },);
    expect(escapeHtml("<b>&\"'",),).toBe("&lt;b&gt;&amp;&quot;&#39;",);
  });

  test("filterCards hides non-matching cards and injects an empty state", async () => {
    const { filterCards, } = await import("./shared");
    const card1 = makeCard("Sword", "a sharp blade",);
    const card2 = makeCard("Potion", "heals",);
    const container = makeEl({ querySelector: (sel,) => (sel === ".empty-state" ? null : null), },);
    installDocument({
      createElement: () => makeEl(),
      querySelector: (sel,) => (sel === "#grid" ? container : null),
      querySelectorAll: (sel,) => (sel === "#grid .card" ? [card1, card2,] : []),
    },);

    filterCards({
      containerId: "#grid",
      cardSelector: ".card",
      nameSelector: ".name",
      descSelector: ".desc",
      query: "zzz-nothing",
      emptyIcon: "🔍",
      emptyTitle: "<No> matches",
    },);

    expect(card1.style.display,).toBe("none",);
    expect(card2.style.display,).toBe("none",);
    expect(container.children.length,).toBe(1,);
    const empty = container.children[0]!;
    expect(empty.className,).toBe("empty-state",);
    expect(empty.innerHTML,).toContain("&lt;No&gt; matches",);
    expect(empty.style.padding,).toBe("var(--space-12)",);
  });

  test("filterCards keeps all cards on empty query and skips empty state", async () => {
    const { filterCards, } = await import("./shared");
    const card1 = makeCard("Sword", "sharp",);
    const container = makeEl();
    installDocument({
      createElement: () => makeEl(),
      querySelector: () => container,
      querySelectorAll: () => [card1,],
    },);

    filterCards({
      containerId: "#grid",
      cardSelector: ".card",
      nameSelector: ".name",
      descSelector: ".desc",
      query: "",
      emptyIcon: "🔍",
      emptyTitle: "none",
    },);

    expect(card1.style.display,).toBe("",);
    expect(container.children.length,).toBe(0,);
  });

  test("filterCards honors matchExtra and emptyStyle", async () => {
    const { filterCards, } = await import("./shared");
    const card1 = makeCard("Sword", "sharp",);
    const card2 = makeCard("Great Sword", "sharp",);
    const container = makeEl({ querySelector: () => null, },);
    installDocument({
      createElement: () => makeEl(),
      querySelector: () => container,
      querySelectorAll: () => [card1, card2,],
    },);

    filterCards({
      containerId: "#grid",
      cardSelector: ".card",
      nameSelector: ".name",
      descSelector: ".desc",
      query: "sword",
      emptyIcon: "🔍",
      emptyTitle: "none",
      emptyStyle: "color: red",
      matchExtra: (card,) => card === (card2 as unknown as Element),
    },);

    expect(card1.style.display,).toBe("none",);
    expect(card2.style.display,).toBe("",);
    expect(container.children.length,).toBe(0,); // something visible → no empty state
  });

  test("filterCards uses emptyStyle for the injected empty state", async () => {
    const { filterCards, } = await import("./shared");
    const card1 = makeCard("Sword", "sharp",);
    const container = makeEl({ querySelector: () => null, },);
    installDocument({
      createElement: () => makeEl(),
      querySelector: () => container,
      querySelectorAll: () => [card1,],
    },);

    filterCards({
      containerId: "#grid",
      cardSelector: ".card",
      nameSelector: ".name",
      descSelector: ".desc",
      query: "zzz-nothing",
      emptyIcon: "🔍",
      emptyTitle: "none",
      emptyStyle: "color: red",
    },);

    expect(container.children[0]!.style.cssText,).toBe("color: red",);
  });
});

// ── filterBar Alpine component ──────────────────────────────

function makeFilterHost(dataset: Record<string, string>,): HTMLElement {
  return {
    closest: (sel: string,) =>
      sel === "[data-show-tag-filter]" || sel === "[data-search-url]" || sel === "[data-target-id]"
        ? { dataset, }
        : null,
  } as unknown as HTMLElement;
}

async function newState(dataset: Record<string, string>,): Promise<FilterBarState> {
  await import("./shared");
  const state = host.filterBar!();
  Object.assign(state, { $el: makeFilterHost(dataset,), },);
  void state.init();
  await flushMicrotasks();
  return state;
}

describe("filterBar", () => {
  test("init fetches the vocabulary only when the tag facet is enabled", async () => {
    feHandler = (
      url,
    ) => (url === "/api/tag-autocomplete" ? jsonResponse({ tags: ["cozy", "dark",], },) : jsonResponse({},));
    const enabled = await newState({ showTagFilter: "true", },);
    await flushMicrotasks();
    expect(enabled.tagOptions,).toEqual(["cozy", "dark",],);

    calls = [];
    const disabled = await newState({},);
    await flushMicrotasks();
    expect(calls.some((c,) => c.url === "/api/tag-autocomplete"),).toBe(false,);
    expect(disabled.tagOptions,).toEqual([],);
  });

  test("init survives a failed vocabulary fetch", async () => {
    feHandler = () => new Response("{}", { status: 500, },);
    const state = await newState({ showTagFilter: "true", },);
    await flushMicrotasks();
    expect(state.tagOptions,).toEqual([],);
  });

  test("activeChips reflects active filters", async () => {
    const state = await newState({},);
    expect(state.activeChips,).toEqual([],);
    state.query = "sw";
    state.typeFilter = "image";
    state.sortBy = "newest";
    state.tagFilter = "cozy";
    expect(state.activeChips,).toEqual([
      { key: "q", label: '"sw"', },
      { key: "type", label: "image", },
      { key: "sort", label: "newest", },
      { key: "tag", label: "cozy", },
    ],);
  });

  test("triggerSearch builds the url from data attributes and fires htmx", async () => {
    const state = await newState({ searchUrl: "/dynamic/gallery/search", targetId: "asset-grid", },);
    state.query = "sw";
    state.tagFilter = "cozy";
    state.triggerSearch();

    expect(htmxCalls.length,).toBe(1,);
    expect(htmxCalls[0]!.method,).toBe("GET",);
    expect(htmxCalls[0]!.url,).toBe("/dynamic/gallery/search?q=sw&tag=cozy",);
    expect(htmxCalls[0]!.opts,).toEqual({ target: "#asset-grid", swap: "innerHTML", },);
  });

  test("triggerSearch falls back to gallery defaults", async () => {
    const state = await newState({},);
    state.triggerSearch();
    expect(htmxCalls[0]!.url,).toBe("/dynamic/gallery/search?",);
    expect(htmxCalls[0]!.opts,).toEqual({ target: "#asset-grid", swap: "innerHTML", },);
  });

  test("removeChip resets one facet and searches", async () => {
    const state = await newState({},);
    state.query = "sw";
    state.tagFilter = "cozy";
    state.removeChip("tag",);
    expect(state.tagFilter,).toBe("all",);
    expect(state.query,).toBe("sw",);
    expect(htmxCalls.length,).toBe(1,);
  });

  test("clearAll resets every facet and searches", async () => {
    const state = await newState({},);
    state.query = "sw";
    state.typeFilter = "image";
    state.sortBy = "newest";
    state.tagFilter = "cozy";
    state.clearAll();
    expect(state.query,).toBe("",);
    expect(state.typeFilter,).toBe("all",);
    expect(state.sortBy,).toBe("name",);
    expect(state.tagFilter,).toBe("all",);
    expect(htmxCalls.length,).toBe(1,);
  });
});
