// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Behavior tests for the Journal Keyphrases UI (TASK-KEYPHRASE-RECALL).
 *
 * `./fe-fetch` and `../ui` are the module seams (mocked — no network); the
 * DOM is stubbed on globalThis. Covers hydration of the row inputs from the
 * memories GET and the save round-trip: trimmed comma-separated keywords,
 * the 8-phrase cap, one PUT per row, and the success toast.
 */
import { afterEach, beforeEach, expect, mock, test, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../../test-utils/isolate-only";

let fetchCalls: { url: string; opts?: RequestInit }[] = [];
let toastCalls: { type: string; message: string }[] = [];
let feHandler: ((url: string,) => Response) | null = null;

if (ISOLATED) {
  mock.module("../fe-fetch", () => ({
    feFetch: async (url: string, opts: RequestInit = {},) => {
      fetchCalls.push({ url, opts, },);
      if (feHandler) { return feHandler(url,); }
      return new Response(JSON.stringify({ items: [], },), { status: 200, },);
    },
    getCsrfToken: () => "",
  }),);

  mock.module("../ui", () => ({
    showToast: (type: string, message: string,) => {
      toastCalls.push({ type, message, },);
    },
  }),);
}

interface FakeRow {
  dataset: { memoryId?: string };
  querySelector: () => { value: string } | null;
}

const host = globalThis as unknown as { document?: unknown };
const originalDocument = host.document;
let rows: FakeRow[];
let listEl: { innerHTML: string; querySelector: () => null };

const page = globalThis as unknown as {
  initJournalKeyphrases: (characterId: string,) => Promise<void>;
  saveJournalKeyphrases: (characterId: string,) => Promise<void>;
};

/**
 * Minimal `createElement` — the real escapeHtml round-trips through a div
 * (`textContent` in, `getHTML()` out).
 */
function makeDiv(): { textContent: string; getHTML: () => string } {
  let text = "";
  return {
    set textContent(value: string,) {
      text = value;
    },
    getHTML: () =>
      text
        .replaceAll("&", "&amp;",)
        .replaceAll("<", "&lt;",)
        .replaceAll(">", "&gt;",)
        .replaceAll('"', "&quot;",)
        .replaceAll("'", "&#39;",),
  } as { textContent: string; getHTML: () => string };
}

beforeEach(() => {
  fetchCalls = [];
  toastCalls = [];
  feHandler = null;
  rows = [];
  listEl = { innerHTML: "", querySelector: () => null, };
  host.document = {
    querySelector: (selector: string,) => selector === "#journal-keyphrase-list" ? listEl : null,
    querySelectorAll: (selector: string,) => selector.includes(".journal-keyphrase-row",) ? rows : [],
    createElement: makeDiv,
  };
},);

afterEach(() => {
  host.document = originalDocument;
},);

describeOrSkip("characters-journal-keyphrases", () => {
  test("hydrates the row inputs from the memories GET", async () => {
    feHandler = () =>
      new Response(
        JSON.stringify({
          items: [
            { id: "m9", content: "The moonstone rite", keywords: JSON.stringify(["moonstone", "rite",],), },
            { id: "m8", content: "Bare entry", keywords: null, },
          ],
        },),
        { status: 200, },
      );
    // Dynamic import: the mocked module seams must be registered first.
    await import("./characters-journal-keyphrases");
    await page.initJournalKeyphrases("actor-9",);

    expect(fetchCalls[0]!.url,).toBe("/api/v1/actors/actor-9/memories",);
    expect(listEl.innerHTML,).toContain('data-memory-id="m9"',);
    expect(listEl.innerHTML,).toContain('value="moonstone, rite"',);
    expect(listEl.innerHTML,).toContain('data-testid="save-keyphrases"',);
  });

  test("saves trimmed keywords per row and caps each list at 8", async () => {
    // Dynamic import: the mocked module seams must be registered first.
    await import("./characters-journal-keyphrases");
    rows = [
      {
        dataset: { memoryId: "m1", },
        querySelector: () => ({ value: " moonstone , ,lantern, a, b, c, d, e, f, g ", }),
      },
      {
        dataset: { memoryId: "m2", },
        querySelector: () => ({ value: "  ", }),
      },
    ];

    await page.saveJournalKeyphrases("actor-1",);

    expect(fetchCalls.length,).toBe(2,);
    expect(fetchCalls[0]!.url,).toBe("/api/v1/actors/actor-1/memories/m1",);
    expect(fetchCalls[0]!.opts!.method,).toBe("PUT",);
    const first = JSON.parse(fetchCalls[0]!.opts!.body as string,) as { keywords: string[] };
    expect(first.keywords,).toEqual(
      ["moonstone", "lantern", "a", "b", "c", "d", "e", "f",],
    );
    const second = JSON.parse(fetchCalls[1]!.opts!.body as string,) as { keywords: string[] };
    expect(second.keywords,).toEqual([],);
    expect(toastCalls,).toEqual([{ type: "success", message: "Keyphrases saved (2)", },],);
  });

  test("reports a partial failure toast when a PUT fails", async () => {
    let putCount = 0;
    feHandler = () => {
      putCount++;
      return new Response("{}", { status: putCount === 1 ? 500 : 200, },);
    };
    // Dynamic import: the mocked module seams must be registered first.
    await import("./characters-journal-keyphrases");
    rows = [
      { dataset: { memoryId: "m1", }, querySelector: () => ({ value: "alpha", }), },
      { dataset: { memoryId: "m2", }, querySelector: () => ({ value: "beta", }), },
    ];

    await page.saveJournalKeyphrases("actor-1",);

    expect(toastCalls,).toEqual([
      { type: "error", message: "Keyphrases: 1 failed, 1 saved", },
    ],);
  });
},);
