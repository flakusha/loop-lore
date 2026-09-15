// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, describe, expect, mock, test, } from "bun:test";
import {
  exportProgress,
  exportProgressFactory,
  type ExportProgressState,
} from "./export-progress";

// ── Mock ../htmx (must precede importing ./export-progress) ──
type ApiFetchMock = (url: string, opts?: RequestInit,) => Promise<Response>;
let calls: { url: string; opts: RequestInit }[] = [];
let handler: ApiFetchMock = async () => Response.json({}, { status: 404, },);

mock.module("./htmx", () => ({
  apiFetch: ((url: string, opts?: RequestInit,) => {
    calls.push({ url, opts: opts ?? {}, },);
    return handler(url, opts,);
  }) satisfies ApiFetchMock,
}),);

const baseCtx = (): ExportProgressState => {
  const state = Object.create(exportProgress,) as ExportProgressState;
  state.jobId = "";
  state.status = "queued";
  state.progress = 0;
  state.total = 0;
  state.percentage = 0;
  state.currentStep = "";
  state.busy = false;
  state.message = "";
  state.error = "";
  state.completedAt = "";
  state.downloadUrl = "";
  state._sse = null;
  state._pollTimer = null;
  return state;
};

afterEach(() => {
  calls = [];
  handler = async () => Response.json({}, { status: 404, },);
},);

describe("exportProgress.isTerminal", () => {
  test("false for queued/processing", () => {
    const ctx = baseCtx();
    ctx.status = "queued";
    expect(ctx.isTerminal(),).toBe(false,);
    ctx.status = "processing";
    expect(ctx.isTerminal(),).toBe(false,);
  });

  test("true for completed/failed", () => {
    const ctx = baseCtx();
    ctx.status = "completed";
    expect(ctx.isTerminal(),).toBe(true,);
    ctx.status = "failed";
    expect(ctx.isTerminal(),).toBe(true,);
  });
});

describe("exportProgress.applyEvent", () => {
  test("applies a progress event", () => {
    const ctx = baseCtx();
    ctx.applyEvent({ type: "progress", jobId: "j1", progress: 5, total: 10, percentage: 50, currentStep: "chats", },);
    expect(ctx.jobId,).toBe("j1",);
    expect(ctx.progress,).toBe(5,);
    expect(ctx.total,).toBe(10,);
    expect(ctx.percentage,).toBe(50,);
    expect(ctx.currentStep,).toBe("chats",);
    expect(ctx.status,).toBe("queued",);
  });

  test("maps type:'completed' → status completed + sets downloadUrl + stops tracking", () => {
    const ctx = baseCtx();
    let closed = false;
    ctx._sse = { close: () => { closed = true; }, } as unknown as EventSource;
    ctx.applyEvent({ type: "job_created", jobId: "j1", status: "queued", },);
    ctx.applyEvent({
      type: "completed",
      jobId: "j1",
      downloadUrl: "/api/export/download/j1",
      totalItems: 10,
      completedAt: "2026-01-01T00:01:00Z",
    },);
    expect(ctx.status,).toBe("completed",);
    expect(ctx.downloadUrl,).toBe("/api/export/download/j1",);
    expect(ctx.completedAt,).toBe("2026-01-01T00:01:00Z",);
    expect(closed,).toBe(true,);
    expect(ctx._sse,).toBeNull();
  });

  test("maps type:'failed' → status failed + captures error", () => {
    const ctx = baseCtx();
    ctx.applyEvent({ type: "job_created", jobId: "j1", status: "queued", },);
    ctx.applyEvent({ type: "failed", jobId: "j1", error: "boom", },);
    expect(ctx.status,).toBe("failed",);
    expect(ctx.error,).toBe("boom",);
    expect(ctx.downloadUrl,).toBe("",);
  });

  test("applies error message", () => {
    const ctx = baseCtx();
    ctx.applyEvent({ type: "error", error: "boom", },);
    expect(ctx.error,).toBe("boom",);
  });
});

describe("exportProgress.applySnapshot", () => {
  test("applies snapshot fields + computes percentage fallback", () => {
    const ctx = baseCtx();
    const terminal = ctx.applySnapshot({
      id: "j1",
      status: "processing",
      progress: 3,
      total: 4,
      percentage: 75,
      currentStep: "chats",
      createdAt: "2026-01-01T00:00:00Z",
    },);
    expect(terminal,).toBe(false,);
    expect(ctx.currentStep,).toBe("chats",);
  });

  test("returns true + sets downloadUrl on completed", () => {
    const ctx = baseCtx();
    const terminal = ctx.applySnapshot({
      id: "j1",
      status: "completed",
      progress: 0,
      total: 0,
      percentage: 0,
      currentStep: "",
      createdAt: "2026-01-01T00:00:00Z",
      completedAt: "2026-01-01T00:01:00Z",
    },);
    expect(terminal,).toBe(true,);
    expect(ctx.downloadUrl,).toBe("/api/export/download/j1",);
  });

  test("captures error on failed", () => {
    const ctx = baseCtx();
    ctx.applySnapshot({
      id: "j1",
      status: "failed",
      progress: 0,
      total: 0,
      percentage: 0,
      currentStep: "",
      createdAt: "2026-01-01T00:00:00Z",
      error: "boom",
    },);
    expect(ctx.error,).toBe("boom",);
  });
});

describe("exportProgress.startExport", () => {
  test("no-op when busy", async () => {
    const ctx = baseCtx();
    ctx.busy = true;
    await ctx.startExport();
    expect(calls,).toHaveLength(0,);
  });

  test("records error on non-200", async () => {
    handler = async () => Response.json({}, { status: 500, },);
    const ctx = baseCtx();
    await ctx.startExport();
    expect(ctx.error,).toBeTruthy();
  });
});

describe("exportProgress.startPolling / stopTracking", () => {
  test("startPolling is no-op without jobId", () => {
    const ctx = baseCtx();
    ctx.startPolling();
    expect(ctx._pollTimer,).toBeNull();
  });

  test("startPolling schedules a timer when jobId is set", () => {
    const ctx = baseCtx();
    ctx.jobId = "j1";
    ctx.startPolling();
    expect(ctx._pollTimer,).not.toBeNull();
    ctx.stopTracking();
    expect(ctx._pollTimer,).toBeNull();
  });

  test("stopTracking is idempotent", () => {
    const ctx = baseCtx();
    ctx.stopTracking();
    ctx.stopTracking();
    expect(ctx._pollTimer,).toBeNull();
  });
});

describe("exportProgress.reset", () => {
  test("clears all state", () => {
    const ctx = baseCtx();
    ctx.jobId = "j1";
    ctx.status = "processing";
    ctx.progress = 5;
    ctx.total = 10;
    ctx.percentage = 50;
    ctx.currentStep = "chats";
    ctx.busy = false;
    ctx.message = "ok";
    ctx.error = "fail";
    ctx.completedAt = "x";
    ctx.downloadUrl = "u";
    ctx.reset();
    expect(ctx.jobId,).toBe("",);
    expect(ctx.status as string,).toBe("queued",);
    expect(ctx.progress,).toBe(0,);
    expect(ctx.total,).toBe(0,);
    expect(ctx.percentage,).toBe(0,);
    expect(ctx.currentStep,).toBe("",);
    expect(ctx.message,).toBe("",);
    expect(ctx.error,).toBe("",);
    expect(ctx.completedAt,).toBe("",);
    expect(ctx.downloadUrl,).toBe("",);
  });
});

const sseBody = (blocks: string[],) =>
  new Response(
    new ReadableStream({
      start(controller,) {
        for (const block of blocks) {
          controller.enqueue(new TextEncoder().encode(block,),);
        }
        controller.close();
      },
    },),
    { status: 200, headers: { "Content-Type": "text/event-stream", }, },
  );

describe("exportProgress.startExport (SSE stream)", () => {
  test("consumes SSE blocks and reaches completed state", async () => {
    handler = async () =>
      sseBody([
        `data: {"type":"job_created","jobId":"j1","status":"queued"}\n\n`,
        `data: {"type":"progress","jobId":"j1","progress":5,"total":10,"percentage":50}\n\n`,
        `data: {"type":"completed","jobId":"j1","downloadUrl":"/api/export/download/j1","totalItems":10}\n\n`,
      ],);
    const ctx = baseCtx();
    await ctx.startExport();
    expect(ctx.jobId,).toBe("j1",);
    expect(ctx.status,).toBe("completed",);
    expect(ctx.downloadUrl,).toBe("/api/export/download/j1",);
  });

  test("falls back to polling when stream ends without terminal event", async () => {
    handler = async () =>
      sseBody([
        `data: {"type":"progress","jobId":"j2","progress":1}\n\n`,
      ],);
    const ctx = baseCtx();
    await ctx.startExport();
    expect(ctx.isTerminal(),).toBe(false,);
    expect(ctx._pollTimer,).not.toBeNull();
    ctx.stopTracking();
  });
});

describe("exportProgress.startPolling tick", () => {
  test("applies a completed snapshot and stops the timer", async () => {
    handler = async () =>
      Response.json({
        id: "j1",
        status: "completed",
        progress: 1,
        total: 1,
        percentage: 100,
        currentStep: "chats",
        createdAt: "2026-01-01T00:00:00Z",
      },);
    const ctx = baseCtx();
    ctx.jobId = "j1";
    ctx.startPolling();
    await Bun.sleep(20,);
    expect(ctx.status,).toBe("completed",);
    expect(ctx._pollTimer,).toBeNull();
  });
});

describe("exportProgress._sse teardown", () => {
  test("applyEvent completion closes the SSE handle", () => {
    const ctx = baseCtx();
    let closed = false;
    ctx._sse = {
      close: () => {
        closed = true;
      },
    } as unknown as EventSource;
    ctx.applyEvent({ type: "job_created", jobId: "j1", status: "queued", },);
    ctx.applyEvent({ type: "completed", jobId: "j1", },);
    expect(closed,).toBe(true,);
    expect(ctx._sse,).toBeNull();
  });
});

describe("exportProgressFactory", () => {
  test("returns a fresh state", () => {
    const a = exportProgressFactory();
    const b = exportProgressFactory();
    expect(a,).not.toBe(b,);
    expect(a.jobId,).toBe("",);
    expect(b.jobId,).toBe("",);
  });
});
