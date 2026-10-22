// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * worlds-io tests — world bundle import validation/error paths and the
 * export URL escape hatch.
 *
 * Resource contract: fake document + fetch/location stubs installed per-test
 * in beforeEach and restored in afterEach; no shared DOM or network.
 * Order-independent.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";

// ── minimal fake DOM ─────────────────────────────────────────

type FakeEl = {
  tagName: string;
  className: string;
  textContent: string;
  children: FakeEl[];
  classList: { add: (c: string,) => void; remove: (c: string,) => void };
  append: (...kids: FakeEl[]) => void;
  setAttribute: (name: string, value: string,) => void;
  addEventListener: (type: string, fn: () => void,) => void;
  remove: () => void;
  querySelector: (sel: string,) => FakeEl | null;
  files?: { text: () => Promise<string> }[];
};

function makeEl(tag: string,): FakeEl {
  const el: FakeEl = {
    tagName: tag,
    className: "",
    textContent: "",
    children: [],
    classList: {
      add: (c,) => {
        el.className += ` ${c}`;
      },
      remove: () => {},
    },
    append: (...kids) => {
      el.children.push(...kids,);
    },
    setAttribute: () => {},
    addEventListener: () => {},
    remove: () => {},
    querySelector: () => null,
  };

  return el;
}

// Installed once — bun's `document` global does not reliably accept repeated
// reassignment across tests, so each test resets the shared fake instead.
const toastContainer = makeEl("div",);
const selectors = new Map<string, FakeEl>([
  ["#toast-container", toastContainer,],
],);

const realDocument = (globalThis as { document?: unknown }).document;
const fakeDocument = {
  cookie: "",
  querySelector: (sel: string,) => selectors.get(sel,) ?? null,
  createElement: (tag: string,) => makeEl(tag,),
};

(globalThis as { document: unknown }).document = fakeDocument;

function toasts(): { type: string; message: string }[] {
  return toastContainer.children.map((t,) => ({
    type: (t.className.match(/toast\s+(\S+)/,) ?? [])[1] ?? "",
    message: t.children[1]?.textContent ?? "",
  }));
}

// ── event/form fixtures ──────────────────────────────────────

type FakeInput = FakeEl & { files: { text: () => Promise<string> }[] };

function importEvent(fileBody: string | null,): Event {
  const form = makeEl("form",);
  if (fileBody !== null) {
    const input = makeEl("input",) as FakeInput;
    input.files = [{ text: async () => fileBody, },];
    form.querySelector = (sel: string,) => sel === "#world-import-file-input" ? (input as unknown as FakeEl) : null;
  }

  return { target: form, preventDefault: () => {}, } as unknown as Event;
}

// ── global stubs ─────────────────────────────────────────────

let fetchCalls: { url: string; opts?: Record<string, unknown> }[] = [];
let fetchImpl: (url: string, opts?: Record<string, unknown>,) => Promise<Response> = async () =>
  new Response(JSON.stringify({},), { status: 200, headers: { "Content-Type": "application/json", }, },);

const realFetch = globalThis.fetch;
let modPromise: Promise<unknown> | null = null;

async function loadWorldsIo(): Promise<void> {
  modPromise ??= import("./worlds-io");
  await modPromise;
}

async function importWorld(): Promise<(event: Event,) => Promise<void>> {
  await loadWorldsIo();
  return (globalThis as unknown as Record<string, (event: Event,) => Promise<void>>).importWorld;
}

async function exportWorld(): Promise<(worldId: string,) => void> {
  await loadWorldsIo();
  return (globalThis as unknown as Record<string, (worldId: string,) => void>).exportWorld;
}

beforeEach(() => {
  (globalThis as { document: unknown }).document = fakeDocument;
  toastContainer.children.length = 0;
  selectors.clear();
  selectors.set("#toast-container", toastContainer,);
  fetchCalls = [];
  fetchImpl = async () =>
    new Response(JSON.stringify({},), { status: 200, headers: { "Content-Type": "application/json", }, },);

  (globalThis as { fetch: unknown }).fetch = (url: string, opts?: Record<string, unknown>,) => {
    fetchCalls.push({ url, opts, },);
    return fetchImpl(url, opts,);
  };
},);

afterEach(() => {
  (globalThis as { fetch: unknown }).fetch = realFetch;
  (globalThis as { document?: unknown }).document = realDocument;
},);

// ── importWorld ──────────────────────────────────────────────

describe("importWorld", () => {
  test("shows an error when the form or file is missing", async () => {
    (await importWorld())(importEvent(null,),);
    expect(toasts(),).toEqual([{ type: "error", message: "Select a .world.json file to import", },],);
    expect(fetchCalls,).toEqual([],);
  });

  test("rejects a file that is not valid JSON", async () => {
    const importFn = await importWorld();
    await importFn(importEvent("{not json",),);
    expect(toasts(),).toEqual([
      { type: "error", message: "Invalid JSON: not a valid world bundle", },
    ],);

    expect(fetchCalls,).toEqual([],);
  });

  test("rejects valid JSON without a `world` object", async () => {
    const importFn = await importWorld();
    await importFn(importEvent(JSON.stringify({ actors: [], },),),);
    expect(toasts(),).toEqual([
      { type: "error", message: "Invalid world bundle: missing `world` object", },
    ],);

    expect(fetchCalls,).toEqual([],);
  });

  test("POSTs the parsed bundle and reports the total imported record count", async () => {
    const modal = makeEl("div",);
    const removed: string[] = [];
    modal.classList.remove = (c,) => {
      removed.push(c,);
    };

    selectors.set("#import-world-modal", modal,);

    fetchImpl = async () =>
      new Response(
        JSON.stringify({ id: "new-world", imported: { actors: 2, items: 1, bogus: "not-a-number", }, },),
        { status: 200, headers: { "Content-Type": "application/json", }, },
      );

    const bundle = { world: { name: "Castle World", }, };
    const importFn = await importWorld();
    await importFn(importEvent(JSON.stringify(bundle,),),);

    expect(fetchCalls,).toHaveLength(1,);
    expect(fetchCalls[0]!.url,).toBe("/api/v1/import/world",);
    expect((fetchCalls[0]!.opts as { method?: string }).method,).toBe("POST",);
    expect(JSON.parse((fetchCalls[0]!.opts as { body: string }).body,),).toEqual(bundle,);
    expect(removed,).toEqual(["open",],);
    expect(toasts(),).toEqual([
      { type: "success", message: "Imported world (3 records)", },
    ],);
  });

  test("surfaces the thrown error message when the import request fails", async () => {
    fetchImpl = async () => {
      throw new Error("world name already exists",);
    };

    const importFn = await importWorld();
    await importFn(importEvent(JSON.stringify({ world: {}, },),),);

    expect(toasts(),).toEqual([
      { type: "error", message: "world name already exists", },
    ],);
  });

  test("shows the plain error message when the failure carries no status", async () => {
    fetchImpl = async () => {
      throw new Error("socket hung up",);
    };

    const importFn = await importWorld();
    await importFn(importEvent(JSON.stringify({ world: {}, },),),);
    expect(toasts(),).toEqual([{ type: "error", message: "socket hung up", },],);
  });
});

// ── exportWorld ──────────────────────────────────────────────

describe("exportWorld", () => {
  test("navigates to the percent-encoded export URL", async () => {
    await import("./worlds-io");
    const assigned: string[] = [];
    const originalLocation = (globalThis as { location?: unknown }).location;
    (globalThis as { location: unknown }).location = {
      assign: (url: string,) => {
        assigned.push(url,);
      },
    };

    const exportFn = await exportWorld();
    try {
      exportFn("w/1?a=1",);
      expect(assigned,).toEqual(["/api/v1/worlds/w%2F1%3Fa%3D1/export",],);
    } finally {
      (globalThis as { location?: unknown }).location = originalLocation;
    }
  });
});
