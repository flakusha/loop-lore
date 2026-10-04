// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for tui/harness/index.ts — the HarnessView overlay widget.
 *
 * `blessed` is stubbed via `mock.module` exactly the way chat/index.test.ts does
 * it: the real implementation builds widgets against a live screen and cannot
 * be constructed against a plain object. The widget under test is the real
 * class, and the API layer is the real one driven through its public
 * `setFetch` seam, so both defects this file pins are observable:
 *
 *   1. The app binds F3 on the same screen. A second binding inside the widget
 *      made one keypress toggle twice — show, then immediately hide.
 *   2. The list `select` handler looked the row up by `el.content`, which holds
 *      the FORMATTED line (no runId anywhere in it), so the lookup always missed
 *      and every click showed row 1's detail.
 */
import { afterAll, beforeAll, beforeEach, expect, it, mock, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../../test-utils/isolate-only";
import { safeFetch, } from "../../utils";
import type { FetchResult, SafeFetchOptions, } from "../../utils/safe-fetch/types";
import type { HarnessView, } from "./index";
import type { HarnessRunDetail, HarnessRunSummary, } from "./types";

/** `setFetch` takes the real fetcher's signature; see api.ts. */
type SetFetchFn = (fn: typeof safeFetch,) => void;

type Handler = (...args: never[]) => void;

interface WidgetStub {
  content: string;
  items: string[];
  shown: boolean;
  handlers: Map<string, Handler[]>;
  keyHandlers: Array<{ keys: string[]; fn: Handler }>;
  on(event: string, fn: Handler,): void;
  emit(event: string, ...args: unknown[]): void;
  setContent(content: string,): void;
  add(item: string,): void;
  clearItems(): void;
  select(index: number,): void;
  show(): void;
  hide(): void;
  render(): void;
  key(keys: string[], fn: Handler,): void;
}

function makeWidget(): WidgetStub {
  const handlers: Map<string, Handler[]> = new Map();
  return {
    content: "",
    items: [],
    shown: false,
    handlers,
    keyHandlers: [],
    on(event: string, fn: Handler,): void {
      const list = handlers.get(event,) ?? [];
      list.push(fn,);
      handlers.set(event, list,);
    },
    emit(event: string, ...args: unknown[]): void {
      for (const fn of handlers.get(event,) ?? []) {
        (fn as unknown as (...a: unknown[]) => void)(...args,);
      }
    },
    setContent(content: string,): void {
      this.content = content;
    },
    add(item: string,): void {
      this.items.push(item,);
    },
    clearItems(): void {
      this.items.length = 0;
    },
    select(_index: number,): void {
      // Selection state lives on the widget; the widget passes the index it
      // wants explicitly to showDetail, so the stub only needs to record it.
    },
    show(): void {
      this.shown = true;
    },
    hide(): void {
      this.shown = false;
    },
    render(): void {
      // Screen painting is not under test.
    },
    key(keys: string[], fn: Handler,): void {
      this.keyHandlers.push({ keys, fn, },);
    },
  };
}

const blessedStub = {
  screen: () => ({ ...makeWidget(), append: () => {}, focused: null, }),
  box: () => makeWidget(),
  list: () => makeWidget(),
  text: () => makeWidget(),
};

if (ISOLATED) {
  mock.module("blessed", () => ({ default: blessedStub, ...blessedStub, }),);
}

let HarnessViewCtor: typeof HarnessView;
let setFetchFn: SetFetchFn;
beforeAll(async () => {
  // Dynamic import required: bun's mock.module rewrites the resolution table
  // only for modules imported after the stub registers, so the type-only
  // imports above are erased and the real symbols arrive through this seam.
  HarnessViewCtor = (await import("./index")).HarnessView;
  setFetchFn = (await import("./api")).setFetch;
},);

afterAll(() => {
  // setFetch mutates a module-level binding with no scope back to it.
  setFetchFn(safeFetch,);
},);

// ── API doubles ──────────────────────────────────────────────────────────
interface RunsResponse {
  items: HarnessRunSummary[];
}
let runsResponse: FetchResult<RunsResponse>;
let detailResponse: FetchResult<HarnessRunDetail>;
let requestedPaths: string[];
let requestedTokens: Array<string | undefined>;

function installFetchStub(): void {
  const stub = async <T,>(url: string, opts?: SafeFetchOptions,): Promise<FetchResult<T>> => {
    const u = new URL(url,);
    requestedPaths.push(u.pathname,);
    requestedTokens.push((opts?.auth as { sessionToken?: string } | undefined)?.sessionToken,);
    const body = u.pathname === "/api/harness/runs" ? runsResponse : detailResponse;
    return body as FetchResult<T>;
  };

  setFetchFn(stub as unknown as typeof safeFetch,);
}

function makeSummary(overrides: Partial<HarnessRunSummary> = {},): HarnessRunSummary {
  return {
    runId: "run-1",
    ts: "2026-01-01T00:00:00Z",
    durationMs: 1_000,
    task: "task one",
    taskType: "chat",
    model: "gpt-4o",
    toolCount: 1,
    result: "ok",
    error: null,
    costUsd: 0.05,
    tokensIn: 10,
    tokensOut: 5,
    branch: "main",
    gitSha: "abc1234",
    pid: 1,
    turnId: "turn-1",
    ...overrides,
  };
}

function makeDetail(runId: string, overrides: Partial<HarnessRunDetail> = {},): HarnessRunDetail {
  return {
    ...makeSummary({ runId, },),
    tools: ["read",],
    pattern: "agent.edit",
    patternDetail: "",
    toolingGap: null,
    msg: null,
    ...overrides,
  };
}

function okRuns(...items: HarnessRunSummary[]): FetchResult<RunsResponse> {
  return { ok: true, data: { items, }, status: 200, headers: new Headers(), };
}

function okDetail(detail: HarnessRunDetail,): FetchResult<HarnessRunDetail> {
  return { ok: true, data: detail, status: 200, headers: new Headers(), };
}

/** api.ts maps a 403 to "admin only" and any other status to `HTTP <n>`. */
function failRuns(status: number,): FetchResult<RunsResponse> {
  return { ok: false, error: new Error("nope",), status, headers: new Headers(), };
}

function failDetail(): FetchResult<HarnessRunDetail> {
  return { ok: false, error: new Error("boom",), headers: new Headers(), };
}

// ── Harness fixtures ──────────────────────────────────────────────────────
interface Fixture {
  view: HarnessView;
  screen: WidgetStub;
  list: WidgetStub;
  box: WidgetStub;
  detailLabel: WidgetStub;
}

function buildView(): Fixture {
  const screen = { ...makeWidget(), append: () => {}, focused: null, };
  const view = new HarnessViewCtor(screen as never, "tok",);
  const inner = view as unknown as Record<string, WidgetStub>;
  return { view, screen, list: inner.list!, box: inner.box!, detailLabel: inner.detailLabel!, };
}

/** Fire every screen.key handler for `name` — how blessed fans a keypress out. */
function pressKey(fixture: Fixture, name: string,): void {
  for (const { keys, fn, } of fixture.screen.keyHandlers) {
    if (keys.includes(name,)) { (fn as unknown as (...a: unknown[]) => void)(name, { name, },); }
  }
}

/**
 * Drain the fire-and-forget `void showDetail()` promises. Every await inside
 * them is on an already-settled stub, so this is pure microtask draining — no
 * wall-clock timer, and it stops the moment the condition holds.
 */
async function flushUntil(predicate: () => boolean,): Promise<void> {
  for (let tick = 0; tick < 100 && !predicate(); tick++) { await Promise.resolve(); }
}

beforeEach(() => {
  requestedPaths = [];
  requestedTokens = [];
  runsResponse = okRuns();
  detailResponse = okDetail(makeDetail("run-1",),);
  installFetchStub();
},);

// The `mock.module` stub only registers under ISOLATED; without it the real
// blessed module loads and the widget is not constructible.
describeOrSkip("HarnessView", () => {
  it("does not bind F3 — the app owns that shortcut", () => {
    const fixture = buildView();
    const bound = fixture.screen.keyHandlers.flatMap((h,) => h.keys);
    expect(bound,).not.toContain("f3",);
  });

  it("binds up/down and enter for navigation", () => {
    const fixture = buildView();
    const bound = fixture.screen.keyHandlers.flatMap((h,) => h.keys);
    expect(bound,).toContain("up",);
    expect(bound,).toContain("down",);
    expect(bound,).toContain("enter",);
  });

  it("starts hidden", () => {
    const fixture = buildView();
    expect(fixture.view.isVisible(),).toBe(false,);
    expect(fixture.box.shown,).toBe(false,);
  });

  it("show/hide/toggle move the panel and the visible flag together", async () => {
    const fixture = buildView();
    fixture.view.show();
    expect(fixture.view.isVisible(),).toBe(true,);
    expect(fixture.box.shown,).toBe(true,);

    fixture.view.hide();
    expect(fixture.view.isVisible(),).toBe(false,);
    expect(fixture.box.shown,).toBe(false,);

    fixture.view.toggle();
    expect(fixture.view.isVisible(),).toBe(true,);
    fixture.view.toggle();
    expect(fixture.view.isVisible(),).toBe(false,);
    await flushUntil(() => requestedPaths.length > 0);
  });

  it("one F3 dispatch leaves the panel open instead of toggling twice", async () => {
    const fixture = buildView();
    // Stand in for app.ts: the app binds F3 on this same screen. A second
    // binding inside the widget would make a single press toggle twice.
    let appToggles = 0;
    fixture.screen.key(["f3",], () => {
      appToggles++;
      fixture.view.toggle();
    },);

    pressKey(fixture, "f3",);
    await flushUntil(() => requestedPaths.length > 0);

    expect(appToggles,).toBe(1,);
    expect(fixture.view.isVisible(),).toBe(true,);
    expect(fixture.box.shown,).toBe(true,);
  });

  it("refresh() stores runs and renders one formatted row each", async () => {
    runsResponse = okRuns(makeSummary({ runId: "run-a", },), makeSummary({ runId: "run-b", },),);
    detailResponse = okDetail(makeDetail("run-a",),);
    const fixture = buildView();
    await fixture.view.refresh();
    expect(fixture.view.getRuns().map((r,) => r.runId),).toEqual(["run-a", "run-b",],);
    expect(fixture.list.items.length,).toBe(2,);
    expect(fixture.list.items[0],).toContain("task one",);
  });

  it("refresh() surfaces the API error in the list and empties runs", async () => {
    runsResponse = failRuns(403,);
    const fixture = buildView();
    await fixture.view.refresh();
    expect(fixture.view.getRuns(),).toEqual([],);
    expect(fixture.list.content,).toBe("admin only",);
    expect(fixture.list.items,).toEqual([],);
    expect(fixture.detailLabel.content,).toBe("",);
  });

  it("refresh() with no runs shows the empty state and clears detail", async () => {
    runsResponse = okRuns();
    const fixture = buildView();
    await fixture.view.refresh();
    expect(fixture.view.getRuns(),).toEqual([],);
    expect(fixture.list.items,).toEqual([],);
    expect(fixture.list.content,).toContain("No harness runs",);
    expect(fixture.detailLabel.content,).toBe("",);
  });

  it("select() uses the index blessed emits, not the formatted row text", async () => {
    runsResponse = okRuns(
      makeSummary({ runId: "run-a", task: "alpha", },),
      makeSummary({ runId: "run-b", task: "bravo", },),
      makeSummary({ runId: "run-c", task: "charlie", },),
    );

    detailResponse = okDetail(makeDetail("run-a",),);
    const fixture = buildView();
    fixture.view.show();
    await fixture.view.refresh();
    await flushUntil(() => fixture.detailLabel.content.includes("run-a",));
    expect(fixture.detailLabel.content,).toContain("run-a",);

    // The row content is the formatted line — it carries no runId at all, which
    // is why the old `findIndex` over `el.content` could never resolve a row.
    const row = fixture.list.items[2]!;
    expect(row,).not.toContain("run-c",);
    detailResponse = okDetail(makeDetail("run-c",),);

    fixture.list.emit("select", { content: row, }, 2,);
    await flushUntil(() => fixture.detailLabel.content.includes("run-c",));

    expect(fixture.detailLabel.content,).toContain("run-c",);
    expect(requestedPaths,).toContain("/api/harness/runs/run-c",);
  });

  it("select() ignores an out-of-range index rather than reading a stale row", async () => {
    runsResponse = okRuns(makeSummary({ runId: "run-a", },), makeSummary({ runId: "run-b", },),);
    detailResponse = okDetail(makeDetail("run-a",),);
    const fixture = buildView();
    fixture.view.show();
    await fixture.view.refresh();
    await flushUntil(() => fixture.detailLabel.content.includes("run-a",));
    fixture.detailLabel.content = "";

    fixture.list.emit("select", { content: "ghost row", }, 99,);
    await flushUntil(() => fixture.detailLabel.content.includes("run-a",));

    // currentIndex stayed on the valid selection, so detail is for run-a.
    expect(fixture.detailLabel.content,).toContain("run-a",);
  });

  it("down wraps from the last run back to the first", async () => {
    runsResponse = okRuns(
      makeSummary({ runId: "run-a", },),
      makeSummary({ runId: "run-b", },),
      makeSummary({ runId: "run-c", },),
    );

    detailResponse = okDetail(makeDetail("run-a",),);
    const fixture = buildView();
    fixture.view.show();
    await fixture.view.refresh();
    await flushUntil(() => fixture.detailLabel.content.includes("run-a",));

    pressKey(fixture, "down",);
    await flushUntil(() => fixture.detailLabel.content.includes("run-b",));
    pressKey(fixture, "down",);
    await flushUntil(() => fixture.detailLabel.content.includes("run-c",));
    detailResponse = okDetail(makeDetail("run-a",),);
    pressKey(fixture, "down",);
    await flushUntil(() => fixture.detailLabel.content.includes("run-a",));

    expect(fixture.detailLabel.content,).toContain("run-a",);
  });

  it("up wraps from the first run to the last", async () => {
    runsResponse = okRuns(makeSummary({ runId: "run-a", },), makeSummary({ runId: "run-b", },),);
    detailResponse = okDetail(makeDetail("run-a",),);
    const fixture = buildView();
    fixture.view.show();
    await fixture.view.refresh();
    await flushUntil(() => fixture.detailLabel.content.includes("run-a",));
    detailResponse = okDetail(makeDetail("run-b",),);

    pressKey(fixture, "up",);
    await flushUntil(() => fixture.detailLabel.content.includes("run-b",));

    expect(fixture.detailLabel.content,).toContain("run-b",);
  });

  it("ignores navigation keys while hidden", async () => {
    runsResponse = okRuns(makeSummary({ runId: "run-a", },), makeSummary({ runId: "run-b", },),);
    detailResponse = okDetail(makeDetail("run-a",),);
    const fixture = buildView();
    await fixture.view.refresh();
    await flushUntil(() => fixture.detailLabel.content.includes("run-a",));
    const pathsAfterRefresh = requestedPaths.length;

    pressKey(fixture, "up",);
    pressKey(fixture, "down",);
    pressKey(fixture, "enter",);
    await flushUntil(() => requestedPaths.length > pathsAfterRefresh);

    expect(requestedPaths.length,).toBe(pathsAfterRefresh,);
    expect(fixture.detailLabel.content,).toContain("run-a",);
  });

  it("enter loads detail for the current row", async () => {
    runsResponse = okRuns(makeSummary({ runId: "run-a", },), makeSummary({ runId: "run-b", },),);
    detailResponse = okDetail(makeDetail("run-a",),);
    const fixture = buildView();
    fixture.view.show();
    await fixture.view.refresh();
    await flushUntil(() => fixture.detailLabel.content.includes("run-a",));
    fixture.detailLabel.content = "";
    detailResponse = okDetail(makeDetail("run-b",),);

    pressKey(fixture, "down",);
    await flushUntil(() => fixture.detailLabel.content.includes("run-b",));
    fixture.detailLabel.content = "";

    pressKey(fixture, "enter",);
    await flushUntil(() => fixture.detailLabel.content.includes("run-b",));
    expect(fixture.detailLabel.content,).toContain("run-b",);
  });

  it("shows an inline error when the detail fetch fails", async () => {
    runsResponse = okRuns(makeSummary({ runId: "run-a", },),);
    detailResponse = failDetail();
    const fixture = buildView();
    fixture.view.show();
    await fixture.view.refresh();
    await flushUntil(() => fixture.detailLabel.content.includes("Failed to load detail",));

    expect(fixture.detailLabel.content,).toContain("Failed to load detail: boom",);
  });

  it("requests at most the runs list, leaving detail untouched when empty", async () => {
    runsResponse = okRuns();
    const fixture = buildView();
    fixture.view.show();
    await fixture.view.refresh();
    await flushUntil(() => requestedPaths.length > 1);

    expect(requestedPaths,).toEqual(["/api/harness/runs",],);
    expect(fixture.detailLabel.content,).toBe("",);
  });

  it("forwards the session token to the api layer", async () => {
    const fixture = buildView();
    await fixture.view.refresh();
    expect(requestedTokens[0],).toBe("tok",);
  });
},);
