// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, expect, mock, test, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../../test-utils/isolate-only";
import { generationBusyState, } from "./generation";
import { DEFAULT_DELAY_MS, type VideoJobControls, videoJobControlState, } from "./video-job-controls";

let calls: { url: string; opts: RequestInit }[] = [];
let handler: ((url: string, opts: RequestInit,) => Response) | null = null;

if (ISOLATED) {
  mock.module("./htmx", () => ({
    apiFetch: async (url: string, opts?: RequestInit,) => {
      calls.push({ url, opts: opts ?? {}, },);
      return handler ? handler(url, opts ?? {},) : Response.json({},);
    },
  }),);
}

afterEach(() => {
  calls = [];
  handler = null;
},);

/** @returns a fresh Alpine state object (methods stay shared by reference). */
function fresh(): VideoJobControls {
  return {
    ...videoJobControlState,
    jobId: "",
    status: "",
    error: "",
    busy: false,
    scheduledFor: null,
  };
}

describeOrSkip("videoJobControls", () => {
  test("poll reads job status and scheduledFor", async () => {
    handler = () =>
      Response.json({
        data: { jobId: "j1", status: "deferred", scheduledFor: 12345, },
      },);

    const state = fresh();
    await state.poll("j1",);

    expect(calls[0]?.url,).toBe("/api/v1/generation/video/status/j1",);
    expect(state.status,).toBe("deferred",);
    expect(state.scheduledFor,).toBe(12345,);
  });

  test("cancel POSTs to the owner-scoped route and refreshes status", async () => {
    handler = (url,) =>
      url.includes("/status/",)
        ? Response.json({ data: { status: "failed", }, },)
        : Response.json({ data: { status: "cancelled", }, },);

    const state = fresh();
    state.jobId = "j1";
    await state.cancel();

    expect(calls[0]?.url,).toBe("/api/v1/generation/jobs/j1/cancel",);
    expect(calls[0]?.opts.method,).toBe("POST",);
    expect(calls[1]?.url,).toContain("/video/status/j1",);
    expect(state.status,).toBe("failed",);
  });

  test("defer posts a future scheduledFor with the delay control", async () => {
    handler = () => Response.json({ data: {}, },);
    const state = fresh();
    state.jobId = "j1";
    const before = Date.now();
    await state.defer(60_000,);

    const body = JSON.parse(calls[0]?.opts.body as string,) as { scheduledFor: number };
    expect(calls[0]?.url,).toBe("/api/v1/generation/jobs/j1/defer",);
    expect(body.scheduledFor,).toBeGreaterThanOrEqual(before + 60_000,);
  });

  test("defer without an explicit delay targets the default one-hour window", async () => {
    handler = () => Response.json({ data: {}, },);
    const state = fresh();
    state.jobId = "j1";
    const before = Date.now();
    await state.defer();
    const after = Date.now();

    const body = JSON.parse(calls[0]?.opts.body as string,) as { scheduledFor: number };
    expect(body.scheduledFor,).toBeGreaterThanOrEqual(before + DEFAULT_DELAY_MS,);
    expect(body.scheduledFor,).toBeLessThanOrEqual(after + DEFAULT_DELAY_MS,);
  });

  test("retry posts to the retry route", async () => {
    handler = () => Response.json({ data: {}, },);
    const state = fresh();
    state.jobId = "j1";
    await state.retry();
    expect(calls[0]?.url,).toBe("/api/v1/generation/jobs/j1/retry",);
  });

  test("control calls are no-ops without a job id", async () => {
    const state = fresh();
    await state.cancel();
    await state.defer();
    await state.retry();
    expect(calls,).toHaveLength(0,);
  });

  test("poll reads the caller-scoped busy count and surfaces read errors", async () => {
    let busyStatus = 200;
    handler = (url,) => {
      if (url.includes("/active/me",)) {
        return busyStatus === 200
          ? Response.json({ count: 2, },)
          : new Response("", { status: busyStatus, },);
      }

      return Response.json({ data: { status: "pending", }, },);
    };

    const state = fresh();
    await state.poll("j1",);
    expect(calls.some((call,) => call.url === "/api/v1/generation/active/me"),).toBe(true,);
    expect(state.activeCount,).toBe(2,);
    expect(state.activeError,).toBe("",);

    busyStatus = 403;
    await state.refreshActive();
    expect(state.activeError,).toBe("Generation activity unavailable (403)",);
  });

  test("busy state export reads the caller-scoped count directly", async () => {
    handler = () => Response.json({ count: 4, },);
    const state = { ...generationBusyState, };
    await state.refreshActive();
    expect(calls.at(-1,)?.url,).toBe("/api/v1/generation/active/me",);
    expect(state.activeCount,).toBe(4,);
  });
},);
