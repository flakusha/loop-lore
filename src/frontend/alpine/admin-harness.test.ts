// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Harness admin tab - component state: loading, 403, empty state, detail fetch.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { readFileSync, } from "node:fs";
import { join, } from "node:path";
import { adminHarness, } from "./admin-harness";

import type { ApiFetchMock, } from "../tests/test-types";
import { RUN, STATS, } from "./admin-harness-fixtures";

const globalState = globalThis as unknown as {
  apiFetch?: ApiFetchMock;
  showToast?: (type: string, message: string,) => void;
};

const originalFetch = globalState.apiFetch;
const originalToast = globalState.showToast;
const localeHost = globalThis as unknown as { __localeStrings?: unknown };
const originalLocale = localeHost.__localeStrings;
let calls: string[] = [];
let handler: ApiFetchMock = async () => Response.json({},);
let toasts: { type: string; message: string }[] = [];

// `t()` resolves against the server-injected catalog; seed it from the real
// en.json so a 403 renders a translated sentence rather than the raw key.
const EN = JSON.parse(
  readFileSync(join(import.meta.dir, "../../public/locales/en.json",), "utf8",),
) as Record<string, unknown>;

beforeEach(() => {
  calls = [];
  toasts = [];
  localeHost.__localeStrings = EN;
  handler = async () => Response.json({},);
  globalState.apiFetch = (url,) => {
    calls.push(url,);
    return handler(url,);
  };

  globalState.showToast = (type, message,) => {
    toasts.push({ type, message, },);
  };
},);

afterEach(() => {
  globalState.apiFetch = originalFetch;
  globalState.showToast = originalToast;
  localeHost.__localeStrings = originalLocale;
},);

/** Route the three harness endpoints; unknown URLs 404. */
function route(opts: {
  runs?: unknown;
  runsStatus?: number;
  rejectRuns?: boolean;
  stats?: unknown;
  statsStatus?: number;
  rejectStats?: boolean;
  detail?: unknown;
  detailStatus?: number;
},): void {
  handler = async (url,) => {
    if (url.startsWith("/api/v1/harness/runs/",)) {
      if (opts.detailStatus) { return new Response("", { status: opts.detailStatus, },); }
      return Response.json(
        opts.detail ??
          { ...RUN, tools: ["read", "edit",], pattern: "p1", patternDetail: "d", toolingGap: "", msg: "done", },
      );
    }

    if (url.startsWith("/api/v1/harness/runs",)) {
      if (opts.rejectRuns) { throw new Error("offline",); }
      if (opts.runsStatus) { return new Response("", { status: opts.runsStatus, },); }
      return Response.json(opts.runs ?? { items: [RUN,], },);
    }

    if (url.startsWith("/api/v1/harness/stats",)) {
      if (opts.rejectStats) { throw new Error("offline",); }
      if (opts.statsStatus) { return new Response("", { status: opts.statsStatus, },); }
      return Response.json(opts.stats ?? STATS,);
    }

    return new Response("", { status: 404, },);
  };
}

/** Fresh copy of the component state, so tests do not share mutations. */
function freshState() {
  return { ...adminHarness, };
}

describe("adminHarness.loadHarness", () => {
  test("fills cards, run rows, model rollup and gaps from the two endpoints", async () => {
    route({},);
    const state = freshState();
    await state.loadHarness();

    expect(state.loadingHarness,).toBe(false,);
    expect(state.harnessError,).toBe("",);
    expect(state.harnessStatCards,).toHaveLength(6,);
    expect(state.harnessRunRows,).toHaveLength(1,);
    expect(state.harnessRunRows[0]?.runId,).toBe("run-1",);
    expect(state.harnessModelRows,).toHaveLength(2,);
    expect(state.harnessGapRows,).toEqual([{ toolingGap: "no-web-search", count: 4, },],);
    expect(state.harnessRunsEmpty(),).toBe(false,);
    expect(calls.sort(),).toEqual(["/api/v1/harness/runs?limit=50", "/api/v1/harness/stats",],);
  });

  test("passes taskType + result as query params and clears them on reset", async () => {
    route({},);
    const state = freshState();
    state.harnessTaskType = "harnessCode";
    state.harnessResult = "error";
    await state.loadHarness();
    expect(calls[0],).toBe("/api/v1/harness/runs?limit=50&taskType=harnessCode&result=error",);

    calls = [];
    state.clearHarnessFilters();
    expect(state.harnessTaskType,).toBe("",);
    expect(state.harnessSearch,).toBe("",);
    expect(calls[0],).toBe("/api/v1/harness/runs?limit=50",);
  });

  test("a 403 renders a readable message instead of a blank table", async () => {
    route({ runsStatus: 403, statsStatus: 403, },);
    const state = freshState();
    await state.loadHarness();

    expect(state.harnessError,).not.toBe("",);
    expect(state.harnessError,).not.toContain("harness.errorForbidden",);
    expect(state.harnessError.toLowerCase(),).toContain("permission",);
    expect(state.harnessRunRows,).toEqual([],);
    // Error state must not masquerade as an empty-data state.
    expect(state.harnessRunsEmpty(),).toBe(false,);
  });

  test("a 403 on stats alone still leaves the runs table populated", async () => {
    route({ statsStatus: 403, },);
    const state = freshState();
    await state.loadHarness();

    expect(state.harnessRunRows,).toHaveLength(1,);
    expect(state.harnessError.toLowerCase(),).toContain("permission",);
  });

  test("an empty run list renders the empty state", async () => {
    route({ runs: { items: [], }, },);
    const state = freshState();
    await state.loadHarness();

    expect(state.harnessRunRows,).toEqual([],);
    expect(state.harnessRunsEmpty(),).toBe(true,);
    expect(state.harnessStatCards,).toHaveLength(6,);
  });

  test("a network failure surfaces an error and leaves the loading flag cleared", async () => {
    route({ rejectRuns: true, rejectStats: true, },);
    const state = freshState();
    await state.loadHarness();

    expect(state.loadingHarness,).toBe(false,);
    expect(state.harnessError,).not.toBe("",);
    expect(state.harnessRunsEmpty(),).toBe(false,);
  });

  test("an unexpected payload shape toasts and falls back to an empty list", async () => {
    route({ runs: { items: [{ runId: 7, },], }, stats: { totals: "nope", }, },);
    const state = freshState();
    await state.loadHarness();

    expect(state.harnessRunRows,).toEqual([],);
    expect(toasts.filter((toast,) => toast.type === "error").length,).toBe(2,);
  });
});

describe("adminHarness.filteredHarnessRuns", () => {
  test("matches task, model and branch, case-insensitively", async () => {
    route({
      runs: { items: [RUN, { ...RUN, runId: "run-2", task: "write docs", model: "opus", branch: "main", },], },
    },);

    const state = freshState();
    await state.loadHarness();

    state.harnessSearch = "DOCS";
    expect(state.filteredHarnessRuns().map((row,) => row.runId),).toEqual(["run-2",],);

    state.harnessSearch = "opus";
    expect(state.filteredHarnessRuns().map((row,) => row.runId),).toEqual(["run-2",],);

    state.harnessSearch = "feat/x";
    expect(state.filteredHarnessRuns().map((row,) => row.runId),).toEqual(["run-1",],);

    state.harnessSearch = "nothing-here";
    expect(state.filteredHarnessRuns(),).toEqual([],);
    expect(state.harnessRunsEmpty(),).toBe(true,);
  });
});

describe("adminHarness.openHarnessRun", () => {
  test("fetches the detail record and shapes it for the activity view", async () => {
    route({},);
    const state = freshState();
    await state.openHarnessRun("run-1",);

    expect(state.harnessRunId,).toBe("run-1",);
    expect(state.loadingHarnessDetail,).toBe(false,);
    expect(state.harnessDetail?.tools,).toEqual(["read", "edit",],);
    expect(state.harnessDetail?.duration,).toBe("1.5s",);
    expect(calls,).toEqual(["/api/v1/harness/runs/run-1",],);

    state.closeHarnessRun();
    expect(state.harnessRunId,).toBe("",);
    expect(state.harnessDetail,).toBeNull();
  });

  test("a 403 on the detail fetch is a readable state, not a crash", async () => {
    route({ detailStatus: 403, },);
    const state = freshState();
    await state.openHarnessRun("run-1",);

    expect(state.harnessDetail,).toBeNull();
    expect(state.harnessError.toLowerCase(),).toContain("permission",);
    expect(state.loadingHarnessDetail,).toBe(false,);
  });

  test("a rejected detail fetch is logged and surfaced", async () => {
    route({},);
    globalState.apiFetch = (url,) => {
      if (url.startsWith("/api/v1/harness/runs/",)) { throw new Error("offline",); }
      return handler(url,);
    };

    const state = freshState();
    await state.openHarnessRun("run-1",);

    expect(state.harnessDetail,).toBeNull();
    expect(state.harnessError,).not.toBe("",);
  });
});
