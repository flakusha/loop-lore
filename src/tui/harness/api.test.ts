// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import { safeFetch, } from "../../utils";
import type { FetchResult, SafeFetchOptions, } from "../../utils/safe-fetch/types";
import { loadRunDetail, loadRuns, loadStats, setFetch, } from "./api";

interface CallRecord {
  url: string;
  limit: number | undefined;
}
let calls: CallRecord[] = [];

/**
 * Resource contract — each test owns its own `calls` recorder (rebound in
 * `beforeEach`) and installs its own fetch stub via `setFetch`, which swaps a
 * module-level binding in api.ts with no scope back to it. Restoring in
 * `afterEach` rather than once in `afterAll` keeps the binding clean between
 * tests and later files in the same process even when a test fails partway
 * through; verified by temporarily deleting the restore: a probe file run after
 * this one still got "admin only" back from the 403 stub installed here.
 */
afterEach(() => {
  setFetch(safeFetch,);
},);

function makeMockSafeFetch<T,>(response: FetchResult<T>,) {
  return async (url: string, _opts?: SafeFetchOptions,) => {
    const u = new URL(url,);
    calls.push({
      url: u.pathname,
      limit: u.searchParams.has("limit",) ? Number(u.searchParams.get("limit",),) : undefined,
    },);

    return response;
  };
}

describe("loadRuns", () => {
  beforeEach(() => {
    calls = [];
  },);

  it("calls GET /api/v1/harness/runs with limit=N", async () => {
    const mockResult: FetchResult<{ items: unknown[] }> = {
      ok: true,
      data: { items: [], },
      status: 200,
      headers: new Headers(),
    };

    setFetch(makeMockSafeFetch(mockResult,) as Parameters<typeof setFetch>[0],);
    await loadRuns(42, undefined,);
    expect(calls.length,).toBe(1,);
    expect(calls[0]!.url,).toBe("/api/v1/harness/runs",);
    expect(calls[0]!.limit,).toBe(42,);
  });

  it("returns ok result with items array on success", async () => {
    const mockResult: FetchResult<{ items: [{ runId: "r1" },] }> = {
      ok: true,
      data: { items: [{ runId: "r1", },], },
      status: 200,
      headers: new Headers(),
    };

    setFetch(makeMockSafeFetch(mockResult,) as Parameters<typeof setFetch>[0],);
    const result = await loadRuns(25, "tok123",);
    expect(result.ok,).toBe(true,);
  });

  it("returns error with 'admin only' on 403", async () => {
    const mockResult: FetchResult<never> = {
      ok: false,
      error: new Error("Forbidden",),
      status: 403,
      headers: new Headers(),
    };

    setFetch(makeMockSafeFetch(mockResult,) as Parameters<typeof setFetch>[0],);
    const result = await loadRuns(25, undefined,);
    expect(result.ok,).toBe(false,);
    if (!result.ok) {
      expect(result.error,).toBe("admin only",);
      expect(result.status,).toBe(403,);
    }
  });

  it("returns error string on network failure", async () => {
    const mockResult: FetchResult<never> = {
      ok: false,
      error: new Error("ECONNREFUSED",),
      headers: new Headers(),
    };

    setFetch(makeMockSafeFetch(mockResult,) as Parameters<typeof setFetch>[0],);
    const result = await loadRuns(25, undefined,);
    expect(result.ok,).toBe(false,);
    if (!result.ok) {
      expect(typeof result.error,).toBe("string",);
      expect(result.error,).not.toBe("admin only",);
    }
  });

  it("passes sessionToken in auth header", async () => {
    let capturedToken: string | undefined;
    const mockResult: FetchResult<{ items: [] }> = {
      ok: true,
      data: { items: [], },
      status: 200,
      headers: new Headers(),
    };

    const mockSf = async (_url: string, opts?: SafeFetchOptions,) => {
      const auth = opts?.auth as { sessionToken?: string } | undefined;
      capturedToken = auth?.sessionToken;
      return mockResult;
    };

    setFetch(mockSf as Parameters<typeof setFetch>[0],);
    await loadRuns(10, "my-super-secret-token",);
    expect(capturedToken,).toBe("my-super-secret-token",);
  });
});

describe("loadRunDetail", () => {
  beforeEach(() => {
    calls = [];
  },);

  it("calls GET /api/v1/harness/runs/:runId", async () => {
    const mockResult: FetchResult<{ runId: "run-99" }> = {
      ok: true,
      data: { runId: "run-99", },
      status: 200,
      headers: new Headers(),
    };

    setFetch(makeMockSafeFetch(mockResult,) as Parameters<typeof setFetch>[0],);
    await loadRunDetail("run-99", undefined,);
    expect(calls.length,).toBe(1,);
    expect(calls[0]!.url,).toBe("/api/v1/harness/runs/run-99",);
  });

  it("returns error with 'admin only' on 403", async () => {
    const mockResult: FetchResult<never> = {
      ok: false,
      error: new Error("Forbidden",),
      status: 403,
      headers: new Headers(),
    };

    setFetch(makeMockSafeFetch(mockResult,) as Parameters<typeof setFetch>[0],);
    const result = await loadRunDetail("run-x", undefined,);
    expect(result.ok,).toBe(false,);
    if (!result.ok) {
      expect(result.error,).toBe("admin only",);
      expect(result.status,).toBe(403,);
    }
  });

  it("returns ok with full detail on success", async () => {
    const detail = {
      runId: "run-5",
      task: "test",
      tools: [],
      pattern: "",
      patternDetail: null,
      toolingGap: null,
      msg: null,
      durationMs: 0,
      ts: "",
      taskType: "chat" as const,
      model: "",
      toolCount: 0,
      result: "ok" as const,
      error: null,
      costUsd: 0,
      tokensIn: 0,
      tokensOut: 0,
      branch: null,
      gitSha: null,
      pid: null,
    };

    const mockResult: FetchResult<typeof detail> = {
      ok: true,
      data: detail,
      status: 200,
      headers: new Headers(),
    };

    setFetch(makeMockSafeFetch(mockResult,) as Parameters<typeof setFetch>[0],);
    const result = await loadRunDetail("run-5", undefined,);
    expect(result.ok,).toBe(true,);
    if (result.ok) { expect(result.data.runId,).toBe("run-5",); }
  });
});

describe("loadStats", () => {
  beforeEach(() => {
    calls = [];
  },);

  it("calls GET /api/v1/harness/stats", async () => {
    const mockResult: FetchResult<{ totals: object }> = {
      ok: true,
      data: { totals: {}, },
      status: 200,
      headers: new Headers(),
    };

    setFetch(makeMockSafeFetch(mockResult,) as Parameters<typeof setFetch>[0],);
    await loadStats(undefined,);
    expect(calls.length,).toBe(1,);
    expect(calls[0]!.url,).toBe("/api/v1/harness/stats",);
  });

  it("returns error with 'admin only' on 403", async () => {
    const mockResult: FetchResult<never> = {
      ok: false,
      error: new Error("Forbidden",),
      status: 403,
      headers: new Headers(),
    };

    setFetch(makeMockSafeFetch(mockResult,) as Parameters<typeof setFetch>[0],);
    const result = await loadStats(undefined,);
    expect(result.ok,).toBe(false,);
    if (!result.ok) {
      expect(result.error,).toBe("admin only",);
      expect(result.status,).toBe(403,);
    }
  });
});
