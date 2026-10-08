// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Behavior tests for the Journal Keyphrases UI (TASK-KEYPHRASE-RECALL).
 *
 * `./fe-fetch` and `../ui` are the module seams (mocked — no network); the
 * DOM is stubbed on globalThis. Covers the paginated memories GET (page
 * params in, `pagination.total`/`totalPages` rendered out), the load-more
 * append, the single-page and empty boundaries, and the save round-trip:
 * trimmed comma-separated keywords, the 8-phrase cap, one PUT per on-screen
 * row, and the success toast.
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

  // Minimal `t` with the real interpolation shape (`{name}` placeholders
  // resolved from `params`, key echoed when absent) so the toast assertions
  // below still exercise the copy the locale file ships.
  const TOAST_STRINGS: Record<string, string> = {
    "toasts.keyphrasesSaved": "Keyphrases saved ({count})",
    "toasts.keyphrasesSaveFailed": "Keyphrases: {failed} failed, {saved} saved",
    "journalKeyphrases.showing": "Showing {shown} of {total}",
    "journalKeyphrases.loadMoreFailed": "Failed to load more journal entries.",
  };

  mock.module("../ui", () => ({
    showToast: (type: string, message: string,) => {
      toastCalls.push({ type, message, },);
    },
    t: (key: string, params?: Record<string, string>,) => {
      const value = TOAST_STRINGS[key] ?? key;
      if (!params) { return value; }
      return value.replaceAll(/\{(\w+)\}/g, (_m, name,) => params[name] ?? `{${name}}`,);
    },
  }),);
}

interface FakeRow {
  dataset: { memoryId?: string };
  querySelector: () => { value: string } | null;
}

/** Button stub: records the click listener so a test can fire it. */
interface FakeButton {
  click: () => Promise<void>;
}

const host = globalThis as unknown as { document?: unknown };
const originalDocument = host.document;

/** Rows `saveJournalKeyphrases` walks — separate from the render fake. */
let rows: FakeRow[];

/** Every load-more button handed out, newest last (each re-render makes a new one). */
let loadMoreButtons: FakeButton[] = [];

interface ListFake {
  innerHTML: string;
  querySelector: (selector: string,) => unknown;
  /** Row HTML appended by load-more, in order. */
  appended: string;
  /** Controls block HTML (count line + buttons) as of the last render. */
  controls: string;
}

let listEl: ListFake;

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

/** Row + control markup the user would actually see, load-more appends included. */
const onScreen = (): string => listEl.innerHTML + listEl.appended;

beforeEach(() => {
  fetchCalls = [];
  toastCalls = [];
  feHandler = null;
  rows = [];
  loadMoreButtons = [];
  listEl = {
    innerHTML: "",
    appended: "",
    controls: "",
    querySelector: (selector: string,) => {
      if (selector.includes("journal-keyphrase-controls",)) {
        return {
          set innerHTML(value: string,) {
            listEl.controls = value;
          },
          get innerHTML() {
            return listEl.controls;
          },
          querySelector: (inner: string,) => {
            // Match `[data-testid='X']` against the rendered controls block.
            const testId = /data-testid=['"]([^'"]+)['"]/.exec(inner,)?.[1] ?? "";
            if (testId === "" || !listEl.controls.includes(`data-testid="${testId}"`,)) { return null; }
            const listeners: Array<() => void | Promise<void>> = [];
            const button: FakeButton = {
              click: async () => {
                for (const fn of [...listeners,]) { await fn(); }
              },
            };

            const record = (type: string, fn: () => void | Promise<void>,) => {
              if (type === "click") { listeners.push(fn,); }
            };

            if (testId === "load-more-keyphrases") { loadMoreButtons.push(button,); }
            return { addEventListener: record, };
          },
        };
      }

      // Rows container: append-only, never re-rendered.
      if (selector.includes("journal-keyphrase-rows",)) {
        return {
          insertAdjacentHTML: (_position: string, html: string,) => {
            listEl.appended += html;
          },
        };
      }

      return null;
    },
  };

  host.document = {
    querySelector: (selector: string,) => selector === "#journal-keyphrase-list" ? listEl : null,
    querySelectorAll: (selector: string,) => selector.includes(".journal-keyphrase-row",) ? rows : [],
    createElement: makeDiv,
  };
},);

afterEach(() => {
  host.document = originalDocument;
},);

/** One memory row for a fake page. */
const memory = (id: string, content: string, keywords: string[] | null = null,) => ({
  id,
  content,
  keywords: keywords === null ? null : JSON.stringify(keywords,),
});

/** jsonPaginated envelope, as `listRoutes` produces it. */
const envelope = (
  data: { id: string; content: string; keywords: string | null }[],
  { total = data.length, page = 1, pageSize = 50, totalPages = 1, } = {},
) => ({ data, pagination: { total, page, pageSize, totalPages, }, });

describeOrSkip("characters-journal-keyphrases", () => {
  test("hydrates the row inputs from page 1 and reports shown-of-total", async () => {
    feHandler = () =>
      new Response(
        JSON.stringify(envelope(
          [
            memory("m9", "The moonstone rite", ["moonstone", "rite",],),
            memory("m8", "Bare entry",),
          ],
          { total: 2, totalPages: 1, },
        ),),
        { status: 200, },
      );

    // Dynamic import: the mocked module seams must be registered first.
    await import("./characters-journal-keyphrases");
    await page.initJournalKeyphrases("actor-9",);

    expect(fetchCalls[0]!.url,).toBe("/api/v1/actors/actor-9/memories?page=1&pageSize=50",);
    expect(listEl.innerHTML,).toContain('data-memory-id="m9"',);
    expect(listEl.innerHTML,).toContain('value="moonstone, rite"',);
    expect(listEl.controls,).toContain('data-testid="save-keyphrases"',);
    expect(listEl.controls,).toContain("Showing 2 of 2",);
  });

  test("a single page renders no load-more control", async () => {
    feHandler = () =>
      new Response(JSON.stringify(envelope([memory("m1", "Only entry",),], { totalPages: 1, },),), {
        status: 200,
      },);

    // Dynamic import: the mocked module seams must be registered first.
    await import("./characters-journal-keyphrases");
    await page.initJournalKeyphrases("actor-1",);

    expect(listEl.controls,).not.toContain("load-more-keyphrases",);
    expect(loadMoreButtons,).toEqual([],);
    expect(listEl.controls,).toContain("Showing 1 of 1",);
  });

  test("multiple pages render the count line and a load-more control", async () => {
    feHandler = () =>
      new Response(
        JSON.stringify(envelope([memory("m1", "First",), memory("m2", "Second",),], {
          total: 5,
          totalPages: 3,
        },),),
        { status: 200, },
      );

    // Dynamic import: the mocked module seams must be registered first.
    await import("./characters-journal-keyphrases");
    await page.initJournalKeyphrases("actor-1",);

    expect(listEl.controls,).toContain("Showing 2 of 5",);
    expect(listEl.controls,).toContain('data-testid="load-more-keyphrases"',);
  });

  test("load-more fetches the next page and appends without duplicating rows", async () => {
    feHandler = (url,) => {
      if (url.includes("page=2",)) {
        return new Response(
          JSON.stringify(envelope([memory("m5", "Fifth",),], {
            total: 5,
            page: 2,
            totalPages: 2,
          },),),
          { status: 200, },
        );
      }

      return new Response(
        JSON.stringify(envelope(
          [memory("m1", "First",), memory("m2", "Second",), memory("m3", "Third",),],
          { total: 5, totalPages: 2, },
        ),),
        { status: 200, },
      );
    };

    // Dynamic import: the mocked module seams must be registered first.
    await import("./characters-journal-keyphrases");
    await page.initJournalKeyphrases("actor-1",);

    expect(fetchCalls.length,).toBe(1,);
    await loadMoreButtons.at(-1,)!.click();

    expect(fetchCalls.map((call,) => call.url),).toEqual([
      "/api/v1/actors/actor-1/memories?page=1&pageSize=50",
      "/api/v1/actors/actor-1/memories?page=2&pageSize=50",
    ],);

    const screen = onScreen();
    expect(screen,).toContain('data-memory-id="m1"',);
    expect(screen,).toContain('data-memory-id="m3"',);
    expect(screen,).toContain('data-memory-id="m5"',);
    // Each row appears exactly once: 3 from page 1, 1 appended.
    expect(screen.match(/data-memory-id="/g,)?.length,).toBe(4,);
    expect(listEl.controls,).toContain("Showing 4 of 5",);
    // Last page reached: no further load-more.
    expect(listEl.controls,).not.toContain("load-more-keyphrases",);
  });

  test("a failing page surfaces the error path and keeps the rows", async () => {
    feHandler = (url,) => {
      if (url.includes("page=2",)) { return new Response("boom", { status: 500, },); }
      return new Response(
        JSON.stringify(envelope([memory("m1", "First",),], { total: 3, totalPages: 2, },),),
        { status: 200, },
      );
    };

    // Dynamic import: the mocked module seams must be registered first.
    await import("./characters-journal-keyphrases");
    await page.initJournalKeyphrases("actor-1",);

    await loadMoreButtons.at(-1,)!.click();

    expect(toastCalls,).toEqual([
      { type: "error", message: "Failed to load more journal entries.", },
    ],);

    expect(onScreen(),).toContain('data-memory-id="m1"',);
    expect(listEl.appended,).toBe("",);
  });

  test("a failing first page renders the load-failed message", async () => {
    feHandler = () => new Response("boom", { status: 500, },);

    // Dynamic import: the mocked module seams must be registered first.
    await import("./characters-journal-keyphrases");
    await page.initJournalKeyphrases("actor-1",);

    expect(listEl.innerHTML,).toContain("journalKeyphrases.loadFailed",);
    expect(listEl.appended,).toBe("",);
  });

  test("an empty result still renders the empty state", async () => {
    feHandler = () => new Response(JSON.stringify(envelope([], { total: 0, totalPages: 0, },),), { status: 200, },);

    // Dynamic import: the mocked module seams must be registered first.
    await import("./characters-journal-keyphrases");
    await page.initJournalKeyphrases("actor-1",);

    expect(listEl.innerHTML,).toContain("journalKeyphrases.empty",);
    expect(listEl.innerHTML,).not.toContain("save-keyphrases",);
  });

  test("saves trimmed keywords per on-screen row and caps each list at 8", async () => {
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
