// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Concurrent `openHarnessRun` calls: a slow earlier response must not
 * overwrite the detail of the run the user selected last.
 *
 * Ordering is controlled with deferred resolvers, so this never waits on the
 * wall clock and cannot flake under CI load.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { adminHarness, } from "./admin-harness";

import type { ApiFetchMock, } from "../tests/test-types";
import { DETAIL, } from "./admin-harness-fixtures";

const globalState = globalThis as unknown as {
  apiFetch?: ApiFetchMock;
  showToast?: (type: string, message: string,) => void;
};

/**
 * Fresh copy of the component state, so tests do not share mutations.
 *
 * Resource contract: this file OWNS the `globalThis.apiFetch` slot for the
 * duration of one test and releases it in `afterEach` — the ambient
 * `apiFetch` global is shared with every other suite in this worker, so a
 * leaked stub silently hijacks their network calls.
 */
function freshState() {
  return { ...adminHarness, };
}

const originalFetch = globalState.apiFetch;

beforeEach(() => {
  // Start from a known-empty slot so a prior suite's leak cannot satisfy the
  // stub below and silently pass the assertions.
  globalState.apiFetch = undefined;
},);

afterEach(() => {
  globalState.apiFetch = originalFetch;
},);

describe("adminHarness.openHarnessRun concurrency", () => {
  test("a stale response cannot overwrite the newly selected run's detail", async () => {
    // Deferred resolvers control ordering exactly - no wall-clock waits.
    type Gate = { promise: Promise<Response>; resolve: (r: Response,) => void };
    const makeGate = (): Gate => {
      const { promise, resolve, } = Promise.withResolvers<Response>();
      return { promise, resolve, };
    };

    const gates: Record<string, Gate> = { "run-slow": makeGate(), "run-fast": makeGate(), };
    globalState.apiFetch = (url,) => {
      const id = url.split("/",).pop() ?? "";
      const found = gates[id];
      if (!found) { throw new Error(`unexpected url ${url}`,); }
      return found.promise;
    };

    const state = freshState();
    const slow = state.openHarnessRun("run-slow",);
    const fast = state.openHarnessRun("run-fast",);

    // The first request resolves last, so its payload is stale.
    gates["run-fast"]?.resolve(Response.json({ ...DETAIL, runId: "run-fast", },),);
    await fast;
    gates["run-slow"]?.resolve(Response.json({ ...DETAIL, runId: "run-slow", },),);
    await slow;

    expect(state.harnessRunId,).toBe("run-fast",);
    expect(state.harnessDetail?.runId,).toBe("run-fast",);
    expect(state.loadingHarnessDetail,).toBe(false,);
  });
});
