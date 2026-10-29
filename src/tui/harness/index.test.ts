// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * HarnessView (pi-tui): run list + detail pane, Up/Down/Enter, empty-state
 * stats and the failure path — driven through the harness api setFetch seam.
 * Pure component.
 */
import { afterEach, describe, expect, it, } from "bun:test";
import { safeFetch, } from "../../utils";
import type { FetchResult, SafeFetchOptions, } from "../../utils/safe-fetch/types";
import { stripRows, tick, } from "../test-support";
import { setFetch, } from "./api";
import { createHarnessView, HarnessView, } from "./index";
import type { HarnessRunDetail, HarnessRunSummary, HarnessStats, } from "./types";

const realFetch = safeFetch;

const RUN_BASE = {
  ts: "2026-01-01T00:00:00.000Z",
  durationMs: 1500,
  taskType: "other",
  model: "gpt-x",
  toolCount: 0,
  error: null,
  branch: null,
  gitSha: null,
  pid: null,
  turnId: null,
} as const;

const RUNS: HarnessRunSummary[] = [
  { ...RUN_BASE, runId: "r-1", task: "check the gate", result: "ok", tokensIn: 10, tokensOut: 5, costUsd: 0.01, },
  {
    ...RUN_BASE,
    runId: "r-2",
    task: "failing task",
    result: "error",
    error: "boom",
    tokensIn: 1,
    tokensOut: 1,
    costUsd: 0,
  },
];

const DETAIL: HarnessRunDetail = {
  ...RUNS[0]!,
  costUsd: 0.25,
  tools: [],
  pattern: "linear",
  patternDetail: "",
  toolingGap: null,
  msg: null,
  branch: "main",
  gitSha: "abc1234",
  pid: 42,
  turnId: "turn-7",
};

const STATS: HarnessStats = {
  totals: { runs: 3, failures: 1, costUsd: 0.5, tokensIn: 100, tokensOut: 50, avgMs: 800, },
  byModel: [],
  byTaskType: [],
  byPattern: [],
  toolingGaps: [],
};

function ok<T,>(data: T,): Promise<FetchResult<T>> {
  return Promise.resolve({ ok: true, data, status: 200, headers: new Headers(), },);
}

/** Route every harness endpoint from the fixtures above. */
function route(runs: HarnessRunSummary[] = RUNS,): void {
  setFetch(<T,>(url: string, _options?: SafeFetchOptions,): Promise<FetchResult<T>> => {
    if (url.includes("/runs?",)) { return ok({ items: runs, } as T,); }
    if (url.endsWith("/stats",)) { return ok(STATS as T,); }
    if (url.includes("/runs/",)) { return ok(DETAIL as T,); }
    return ok({} as T,);
  },);
}

afterEach(() => {
  setFetch(realFetch,);
},);

function build() {
  const view = createHarnessView({ sessionToken: "tok", getViewportRows: () => 30, },);
  return view;
}

describe("HarnessView", () => {
  it("loads runs on refresh and renders list + first detail", async () => {
    route();
    const view = build();
    view.show();
    await view.refresh();
    await tick(2,);

    const rows = stripRows(view.render(80,),).join("\n",);
    expect(rows,).toContain("Harness Runs",);
    expect(rows,).toContain("check the gate",);
    expect(rows,).toContain("Turn: turn-7",);
    expect(rows,).toContain("Cost: $0.2500",);
    expect(view.getRuns(),).toHaveLength(2,);
  });

  it("Up/Down move the selection; Enter reloads the detail", async () => {
    route();
    const view = build();
    view.show();
    await view.refresh();
    await tick(2,);

    view.handleInput("\x1b[B",);
    expect(view.getCursor(),).toBe(1,);
    expect(stripRows(view.render(80,),).join("\n",),).toContain("> ✘  1.5s  failing task",);

    const before = view.render(80,).length;
    view.handleInput("\r",);
    await tick();
    expect(view.render(80,).length,).toBeGreaterThan(0,);
    expect(before,).toBeGreaterThan(0,);
  });

  it("empty run list falls back to the stats line", async () => {
    route([],);
    const view = build();
    view.show();
    await view.refresh();
    await tick(2,);

    const rows = stripRows(view.render(80,),).join("\n",);
    expect(rows,).toContain("No harness runs recorded yet.",);
    expect(rows,).toContain("Stats",);
  });

  it("a failed load renders the error and keeps the view usable", async () => {
    setFetch(<T,>(_url: string, _options?: SafeFetchOptions,): Promise<FetchResult<T>> =>
      Promise.resolve({ ok: false, error: new Error("HTTP 500",), status: 500, headers: new Headers(), },)
    );

    const view = build();
    view.show();
    await view.refresh();
    await tick();

    expect(stripRows(view.render(80,),).join("\n",),).toContain("HTTP 500",);
    expect(view.getRuns(),).toEqual([],);
  });

  it("dismiss/toggle track visibility", async () => {
    route();
    const view = build();
    expect(view.dismiss(),).toBe(false,);
    view.toggle();
    expect(view.isVisible(),).toBe(true,);
    await view.refresh();
    view.toggle();
    expect(view.isVisible(),).toBe(false,);
    expect(view.dismiss(),).toBe(false,);
  });

  it("handles no keys while hidden", async () => {
    route();
    const view = build();
    await view.refresh();
    await tick();
    view.handleInput("\x1b[B",);
    expect(view.getCursor(),).toBe(0,);
  });

  it("the class is constructible directly; the factory is a thin default-setter", () => {
    const direct = new HarnessView({ getViewportRows: () => 12, },);
    expect(direct.isVisible(),).toBe(false,);
    expect(stripRows(direct.render(40,),).join("\n",),).toContain("No harness runs recorded yet.",);
  });
});
