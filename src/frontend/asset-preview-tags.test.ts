// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Behavioral tests for the asset-preview tagging surface (gallery G7).
 *
 * Drives `openAssetPreview` against a fake DOM whose elements stash real event
 * listeners, so `renderTagsPanel` / `submitTag` / `removeTag` / `dismissTag` /
 * `renderAutocomplete` are exercised through the public global. `./fe-fetch`
 * is the module seam (Bun permanently binds `fetch`); `./ui` is stubbed so the
 * fire-and-forget toast import resolves without pulling the real UI module.
 */
import { afterEach, beforeEach, describe, expect, mock, test, vi, } from "bun:test";

import "./asset-preview";

let calls: { url: string; opts: RequestInit }[] = [];
let feHandler: ((url: string, opts: RequestInit,) => Response) | null = null;
mock.module("./fe-fetch", () => ({
  feFetch: async (url: string, opts: RequestInit = {},) => {
    calls.push({ url, opts, },);
    return feHandler ? feHandler(url, opts,) : new Response("{}", { status: 404, },);
  },
  getCsrfToken: () => "",
}),);
mock.module("./ui", () => ({
  showToast: (_type: string, _message: string,) => {},
}),);

// ── Minimal fake DOM ────────────────────────────────────────

type Handler = (ev: { preventDefault(): void },) => void | Promise<void>;

interface El {
  innerHTML: string;
  textContent: string;
  value: string;
  checked: boolean;
  dataset: Record<string, string>;
  style: Record<string, string>;
  classList: { add(...n: string[]): void; remove(...n: string[]): void; contains(n: string,): boolean };
  addEventListener(type: string, fn: Handler,): void;
  dispatch(type: string,): Promise<void>;
  querySelector(sel: string,): El | null;
  querySelectorAll(sel: string,): El[];
  focus(): void;
}

function makeEl(overrides: Partial<El> = {},): El {
  const classes = new Set<string>();
  const listeners = new Map<string, Handler[]>();
  const self: El = {
    innerHTML: "",
    textContent: "",
    value: "",
    checked: false,
    dataset: {},
    style: {},
    classList: {
      add: (...n) => {
        for (const x of n) { classes.add(x,); }
      },
      remove: (...n) => {
        for (const x of n) { classes.delete(x,); }
      },
      contains: (n,) => classes.has(n,),
    },
    addEventListener: (type, fn,) => {
      const list = listeners.get(type,) ?? [];
      list.push(fn,);
      listeners.set(type, list,);
    },
    dispatch: async (type,) => {
      // Snapshot listeners so a re-render registering same-type handlers
      // during dispatch cannot extend this loop.
      const snapshot = (listeners.get(type,) ?? []).slice();
      for (const fn of snapshot) { await fn({ preventDefault() {}, },); }
    },
    querySelector: () => null,
    querySelectorAll: () => [],
    focus: () => {},
  };
  return Object.assign(self, overrides,);
}

/** Drain pending promise microtasks (dynamic import + feFetch hops). */
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 16; i++) { await Promise.resolve(); }
}

interface TagDom {
  panel: El;
  form: El;
  input: El;
  globalEl: El;
  ac: El;
  removeBtn: El;
  acceptBtn: El;
  dismissBtn: El;
}

function makeTagDom(): TagDom {
  const panel = makeEl();
  const form = makeEl();
  const input = makeEl({ value: "", },);
  const ac = makeEl({ style: { display: "none", }, },);
  const globalEl = makeEl({ checked: false, },);
  const removeBtn = makeEl({ dataset: { removeTag: "chip", scope: "user", }, },);
  const acceptBtn = makeEl({ dataset: { acceptTag: "prop", }, },);
  const dismissBtn = makeEl({ dataset: { dismissTag: "prop", }, },);

  const single: Record<string, El> = {
    "[data-tag-form]": form,
    "[data-tag-input]": input,
    "[data-tag-global]": globalEl,
    "[data-autocomplete]": ac,
  };
  const many: Record<string, El[]> = {
    "[data-remove-tag]": [removeBtn,],
    "[data-accept-tag]": [acceptBtn,],
    "[data-dismiss-tag]": [dismissBtn,],
    "[data-autocomplete-tag]": [],
  };
  panel.querySelector = (sel,) => single[sel] ?? null;
  panel.querySelectorAll = (sel,) => many[sel] ?? [];

  return { panel, form, input, ac, globalEl, removeBtn, acceptBtn, dismissBtn, };
}

type FieldMap = Record<string, El>;

interface ModalEl extends El {
  fields: FieldMap;
}

interface FakeDocument {
  bySelector: Map<string, El>;
  byId: Map<string, El>;
  querySelector(sel: string,): El | null;
  createElement(_tag: string,): El;
  addEventListener(_t: string, _fn: unknown,): void;
}

function makeDocument(): FakeDocument {
  const bySelector = new Map<string, El>();
  const byId = new Map<string, El>();
  return {
    bySelector,
    byId,
    querySelector: (sel,) => (sel.startsWith("#",) ? byId.get(sel.slice(1,),) ?? null : bySelector.get(sel,) ?? null),
    createElement: () => makeEl(),
    addEventListener: () => {},
  };
}

const docHost = globalThis as { document?: unknown };
const previewHost = globalThis as unknown as { openAssetPreview?: (id: string,) => Promise<void> };
const originalDocument = docHost.document;

let doc: FakeDocument;
let tagDom: TagDom;

const ASSET = { id: "a1", filename: "cat.png", mime_type: "image/png", size_bytes: 2048, asset_type: "model", };

function jsonResponse(body: unknown, status = 200,): Response {
  return new Response(JSON.stringify(body,), { status, },);
}

function serveTags(tags: unknown[], propositions: unknown[],): void {
  feHandler = (url, init,) => {
    if (url === "/api/assets/a1" && !init.method) { return jsonResponse(ASSET,); }
    if (url === "/api/assets/a1/tags" && !init.method) { return jsonResponse({ tags, },); }
    if (url === "/api/assets/a1/tag-propositions" && !init.method) { return jsonResponse({ propositions, },); }
    if (url === "/api/assets/a1/tags" && init.method === "POST") { return jsonResponse({},); }
    if (url === "/api/assets/a1/tags" && init.method === "DELETE") { return jsonResponse({},); }
    if (url === "/api/assets/a1/tag-propositions" && init.method === "DELETE") { return jsonResponse({},); }
    if (url.startsWith("/api/tag-autocomplete",)) { return jsonResponse({ tags: ["cellar", "tavern",], },); }
    return jsonResponse({}, 404,);
  };
}

beforeEach(() => {
  doc = makeDocument();
  docHost.document = doc as unknown as Document;

  const modal = makeEl() as ModalEl;
  const fields: FieldMap = {
    filename: makeEl(),
    mime: makeEl(),
    size: makeEl(),
    "preview-body": makeEl(),
  };
  modal.fields = fields;
  modal.querySelector = (sel,) => {
    const match = /data-field=['"]([^'"]+)['"]/.exec(sel,);
    return match ? fields[match[1]!] ?? null : null;
  };
  tagDom = makeTagDom();
  doc.byId.set("preview-modal", modal,);
  doc.bySelector.set("[data-field='tags-panel']", tagDom.panel,);

  calls = [];
  feHandler = null;
},);

afterEach(() => {
  docHost.document = originalDocument;
},);

describe("renderTagsPanel", () => {
  test("renders tag chips and proposition chips", async () => {
    serveTags(
      [{ id: "t1", tag: "shared", scope: "global", source: "manual", },],
      [{ tag: "cozy", provenance: "alt_text", },],
    );
    await previewHost.openAssetPreview!("a1",);

    expect(tagDom.panel.innerHTML,).toContain('data-testid="asset-tag-shared"',);
    expect(tagDom.panel.innerHTML,).toContain('data-testid="asset-proposal-cozy"',);
  });

  test("submitting the form POSTs a user-scope tag", async () => {
    serveTags([], [],);
    await previewHost.openAssetPreview!("a1",);
    tagDom.input.value = "newtag";
    tagDom.globalEl.checked = false;
    await tagDom.form.dispatch("submit",);
    await flushMicrotasks();
    const post = calls.find((c,) => c.url === "/api/assets/a1/tags" && c.opts.method === "POST")!;
    expect(post,).toBeDefined();
    expect(JSON.parse(String(post.opts.body,),),).toEqual({ tag: "newtag", scope: "user", },);
  });

  test("global checkbox submits global scope", async () => {
    serveTags([], [],);
    await previewHost.openAssetPreview!("a1",);
    tagDom.input.value = "shared";
    tagDom.globalEl.checked = true;
    await tagDom.form.dispatch("submit",);
    await flushMicrotasks();
    const post = calls.find((c,) => c.url === "/api/assets/a1/tags" && c.opts.method === "POST")!;
    expect(post,).toBeDefined();
    expect(JSON.parse(String(post.opts.body,),),).toEqual({ tag: "shared", scope: "global", },);
  });

  test("empty input does not submit", async () => {
    serveTags([], [],);
    await previewHost.openAssetPreview!("a1",);
    const before = calls.length;
    tagDom.input.value = "   ";
    await tagDom.form.dispatch("submit",);
    await flushMicrotasks();
    expect(calls.length,).toBe(before,);
  });
});

describe("remove / dismiss wiring", () => {
  test("remove button sends DELETE with scope", async () => {
    serveTags([{ id: "t1", tag: "chip", scope: "user", source: "manual", },], [],);
    await previewHost.openAssetPreview!("a1",);
    await tagDom.removeBtn.dispatch("click",);
    await flushMicrotasks();
    const del = calls.find((c,) => c.url === "/api/assets/a1/tags" && c.opts.method === "DELETE")!;
    expect(del,).toBeDefined();
    expect(JSON.parse(String(del.opts.body,),),).toEqual({ tag: "chip", scope: "user", },);
  });

  test("dismiss button sends DELETE to tag-propositions", async () => {
    serveTags([], [{ tag: "prop", provenance: "filename", },],);
    await previewHost.openAssetPreview!("a1",);
    await tagDom.dismissBtn.dispatch("click",);
    await flushMicrotasks();
    const del = calls.find((c,) => c.url === "/api/assets/a1/tag-propositions" && c.opts.method === "DELETE")!;
    expect(del,).toBeDefined();
    expect(JSON.parse(String(del.opts.body,),),).toEqual({ tag: "prop", },);
  });
});

describe("renderAutocomplete", () => {
  test("debounced input fetches vocabulary and populates the container", async () => {
    vi.useFakeTimers();
    try {
      serveTags([], [],);
      await previewHost.openAssetPreview!("a1",);
      tagDom.input.value = "t";
      tagDom.input.dispatch("input",);
      tagDom.input.dispatch("input",); // trailing debounce — only one fetch after window
      vi.advanceTimersByTime(150,);
      await flushMicrotasks();
      await flushMicrotasks();
      expect(calls.some((c,) => c.url.startsWith("/api/tag-autocomplete?q=t",)),).toBe(true,);
      expect(tagDom.ac.innerHTML,).toContain('data-autocomplete-tag="tavern"',);
      expect(tagDom.ac.style.display,).toBe("flex",);
    } finally {
      vi.useRealTimers();
    }
  });
});
