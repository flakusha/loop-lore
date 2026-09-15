// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, describe, expect, mock, test, } from "bun:test";
import {
  actorEmotionAvatars,
  type ActorEmotionAvatarsState,
  ALL_EMOTIONS,
  type EmotionAvatarJob,
} from "./actor-emotion-avatars";

// ── Mock ../htmx (must precede importing ./actor-emotion-avatars) ──
type ApiFetchMock = (url: string, opts?: RequestInit,) => Promise<Response>;
let calls: { url: string; opts: RequestInit }[] = [];
let handler: ApiFetchMock = async () => Response.json({ jobs: [], },);

mock.module("./htmx", () => ({
  apiFetch: ((url: string, opts?: RequestInit,) => {
    calls.push({ url, opts: opts ?? {}, },);
    return handler(url, opts,);
  }) satisfies ApiFetchMock,
}),);

const baseCtx = (): ActorEmotionAvatarsState & Record<string, unknown> => {
  const state = Object.create(actorEmotionAvatars,) as ActorEmotionAvatarsState & Record<string, unknown>;
  state._emAvatarJobs = [];
  state._emAvatarSelected = [];
  state._emAvatarActorId = null;
  state._emAvatarBusy = false;
  state._emAvatarError = "";
  state._emAvatarBaseId = "base-1";
  state._emAvatarPolling = null;
  return state;
};

/** Drive the microtask queue (handles bare `void promise` inside setActorId). */
const flush = async (): Promise<void> => {
  const { promise, resolve, } = Promise.withResolvers<void>();
  queueMicrotask(() => {
    resolve();
  },);
  await promise;
};

afterEach(() => {
  calls = [];
  handler = async () => Response.json({ jobs: [], },);
},);

describe("actorEmotionAvatars.setActorId", () => {
  test("binds and resets prior state on first set", () => {
    const ctx = baseCtx();
    ctx.setActorId("actor-1",);
    expect(ctx._emAvatarActorId,).toBe("actor-1",);
  });

  test("no-op when actor unchanged", async () => {
    const ctx = baseCtx();
    ctx.setActorId("actor-1",);
    await flush();
    const before = ctx._emAvatarJobs;
    ctx.setActorId("actor-1",);
    expect(ctx._emAvatarJobs,).toBe(before,);
  });

  test("stops polling on actor swap", async () => {
    const ctx = baseCtx();
    ctx.setActorId("actor-1",);
    await flush();
    ctx._emAvatarPolling = setInterval(() => {}, 60_000,) as ActorEmotionAvatarsState["_emAvatarPolling"];
    ctx.setActorId("actor-2",);
    expect(ctx._emAvatarPolling,).toBeNull();
  });
});

describe("actorEmotionAvatars.loadJobs", () => {
  test("no-op when no actor is bound", async () => {
    const ctx = baseCtx();
    await ctx.loadJobs();
    expect(calls,).toHaveLength(0,);
  });

  test("populates _emAvatarJobs on 200", async () => {
    const jobs: EmotionAvatarJob[] = [{
      id: "job-1",
      status: "completed",
      progress: 18,
      total: 18,
      emotions: ["happy",],
      createdAt: "2026-01-01T00:00:00Z",
      completedAt: "2026-01-01T00:01:00Z",
      error: null,
    },];
    handler = async () => Response.json({ jobs, },);
    const ctx = baseCtx();
    ctx.setActorId("actor-1",);
    await flush();
    expect(ctx._emAvatarJobs,).toEqual(jobs,);
  });

  test("tolerates non-200 silently", async () => {
    handler = async () => Response.json({}, { status: 500, },);
    const ctx = baseCtx();
    ctx.setActorId("actor-1",);
    await flush();
    expect(ctx._emAvatarJobs,).toEqual([],);
  });

  test("records an error message on network failure", async () => {
    handler = async () => {
      throw new Error("boom",);
    };
    const ctx = baseCtx();
    ctx.setActorId("actor-1",);
    await flush();
    expect(ctx._emAvatarError,).toBeTruthy();
  });
});

describe("actorEmotionAvatars.toggleEmotion / selectAll / clearSelection", () => {
  test("toggle adds then removes", () => {
    const ctx = baseCtx();
    ctx.toggleEmotion("happy",);
    ctx.toggleEmotion("sad",);
    expect(ctx._emAvatarSelected,).toEqual(["happy", "sad",],);
    ctx.toggleEmotion("happy",);
    expect(ctx._emAvatarSelected,).toEqual(["sad",],);
  });

  test("selectAll seeds every known emotion", () => {
    const ctx = baseCtx();
    ctx.selectAll();
    expect(ctx._emAvatarSelected.length,).toBe(ALL_EMOTIONS.length,);
    for (const e of ALL_EMOTIONS) {
      expect(ctx._emAvatarSelected.includes(e,),).toBe(true,);
    }
  });

  test("clearSelection empties the array", () => {
    const ctx = baseCtx();
    ctx.selectAll();
    ctx.clearSelection();
    expect(ctx._emAvatarSelected,).toEqual([],);
  });
});

describe("actorEmotionAvatars.startBatch", () => {
  test("no-op without actor id", async () => {
    const ctx = baseCtx();
    await ctx.startBatch();
    expect(calls,).toHaveLength(0,);
  });

  test("errors when no base avatar is set", async () => {
    const ctx = baseCtx();
    ctx._emAvatarActorId = "actor-1";
    ctx._emAvatarBaseId = "";
    ctx._emAvatarSelected = ["happy",];
    await ctx.startBatch();
    expect(ctx._emAvatarError,).toBeTruthy();
    expect(calls,).toHaveLength(0,);
  });

  test("errors when no emotions are selected", async () => {
    const ctx = baseCtx();
    ctx._emAvatarActorId = "actor-1";
    ctx._emAvatarBaseId = "base-1";
    await ctx.startBatch();
    expect(ctx._emAvatarError,).toBeTruthy();
    expect(calls,).toHaveLength(0,);
  });

  test("posts the selection and starts polling on success", async () => {
    handler = async () => Response.json({ jobId: "job-99", }, { status: 201, },);
    const ctx = baseCtx();
    ctx._emAvatarActorId = "actor-1";
    ctx._emAvatarBaseId = "base-1";
    ctx._emAvatarSelected = ["happy", "sad",];
    await ctx.startBatch();
    expect(calls.length,).toBeGreaterThanOrEqual(1,);
    expect(calls[0]!.url,).toBe("/api/actors/actor-1/emotion-avatars",);
    expect(calls[0]!.opts.method,).toBe("POST",);
    expect(ctx._emAvatarPolling,).not.toBeNull();
    ctx.stopPolling();
  });

  test("captures server-side message on non-201", async () => {
    handler = async () => Response.json({ message: "rate limited", }, { status: 429, },);
    const ctx = baseCtx();
    ctx._emAvatarActorId = "actor-1";
    ctx._emAvatarBaseId = "base-1";
    ctx._emAvatarSelected = ["happy",];
    await ctx.startBatch();
    expect(ctx._emAvatarError,).toBe("rate limited",);
    expect(ctx._emAvatarPolling,).toBeNull();
  });

  test("records generic error on network failure", async () => {
    handler = async () => {
      throw new Error("net",);
    };
    const ctx = baseCtx();
    ctx._emAvatarActorId = "actor-1";
    ctx._emAvatarBaseId = "base-1";
    ctx._emAvatarSelected = ["happy",];
    await ctx.startBatch();
    expect(ctx._emAvatarError,).toBeTruthy();
    expect(ctx._emAvatarBusy,).toBe(false,);
  });

  test("ignores calls while busy (synchronous double-tap)", async () => {
    // Yield a single pending handler; resolve it inline so the first call can complete.
    let resolveHandler: ((r: Response,) => void) | null = null;
    handler = async () =>
      new Promise<Response>((r,) => {
        resolveHandler = r;
        queueMicrotask(() => r(Response.json({ jobId: "j", }, { status: 201, },),));
      },);
    const ctx = baseCtx();
    ctx._emAvatarActorId = "actor-1";
    ctx._emAvatarBaseId = "base-1";
    ctx._emAvatarSelected = ["happy",];
    const p1 = ctx.startBatch();
    // Pre-resolution on the next tick: the handler resolves itself; await p1.
    const callsWhileBusy = calls.length;
    await ctx.startBatch();
    expect(calls.length,).toBe(callsWhileBusy,);
    await p1;
    ctx.stopPolling();
    // resolveHandler is assigned but never used now — keep the closure live to avoid an unused-var lint.
    void resolveHandler;
  });
});

describe("actorEmotionAvatars.cancelJob", () => {
  test("POSTs the cancel endpoint and reloads jobs", async () => {
    handler = async () => Response.json({ ok: true, cancelled: true, },);
    const ctx = baseCtx();
    ctx._emAvatarActorId = "actor-1";
    await ctx.cancelJob("job-1",);
    expect(
      calls.some((c,) => c.url === "/api/actors/actor-1/emotion-avatars/jobs/job-1/cancel" && c.opts.method === "POST"),
    )
      .toBe(true,);
  });

  test("no-op without actor id", async () => {
    const ctx = baseCtx();
    await ctx.cancelJob("job-1",);
    expect(calls,).toHaveLength(0,);
  });
});

describe("actorEmotionAvatars.describeStatus", () => {
  test("returns localized text for terminal statuses", () => {
    const ctx = baseCtx();
    const job: EmotionAvatarJob = {
      id: "x",
      status: "completed",
      progress: 0,
      total: 0,
      emotions: [],
      createdAt: "",
      completedAt: null,
      error: null,
    };
    const s = ctx.describeStatus(job,);
    expect(s.length > 0,).toBe(true,);
    expect(s.includes("%",),).toBe(false,);
  });

  test("returns percent for in-flight jobs", () => {
    const ctx = baseCtx();
    const job: EmotionAvatarJob = {
      id: "x",
      status: "running",
      progress: 5,
      total: 20,
      emotions: [],
      createdAt: "",
      completedAt: null,
      error: null,
    };
    expect(ctx.describeStatus(job,),).toBe("25%",);
  });

  test("handles zero-total gracefully", () => {
    const ctx = baseCtx();
    const job: EmotionAvatarJob = {
      id: "x",
      status: "queued",
      progress: 0,
      total: 0,
      emotions: [],
      createdAt: "",
      completedAt: null,
      error: null,
    };
    expect(ctx.describeStatus(job,),).toBe("0%",);
  });
});

describe("actorEmotionAvatars._pollJobOnce", () => {
  test("returns null when no actor id is bound", async () => {
    const ctx = baseCtx();
    expect(await ctx._pollJobOnce("job-1",),).toBeNull();
  });

  test("returns the job on 200", async () => {
    handler = async () =>
      Response.json({
        id: "job-1",
        status: "running",
        progress: 4,
        total: 10,
        emotions: [],
        createdAt: "",
        completedAt: null,
        error: null,
      },);
    const ctx = baseCtx();
    ctx._emAvatarActorId = "actor-1";
    const job = await ctx._pollJobOnce("job-1",);
    expect(job?.status,).toBe("running",);
  });

  test("returns null on non-200", async () => {
    handler = async () => Response.json({}, { status: 500, },);
    const ctx = baseCtx();
    ctx._emAvatarActorId = "actor-1";
    expect(await ctx._pollJobOnce("job-1",),).toBeNull();
  });
});

describe("actorEmotionAvatars stopPolling / _startPolling", () => {
  test("stopPolling is safe on null", () => {
    const ctx = baseCtx();
    ctx._emAvatarPolling = null;
    expect(() => ctx.stopPolling()).not.toThrow();
  });

  test("_startPolling clears any existing handle", () => {
    const ctx = baseCtx();
    ctx._emAvatarActorId = "actor-1";
    ctx._emAvatarPolling = setInterval(() => {}, 60_000,) as ActorEmotionAvatarsState["_emAvatarPolling"];
    ctx._startPolling("job-1",);
    expect(ctx._emAvatarPolling,).not.toBeNull();
    ctx.stopPolling();
    expect(ctx._emAvatarPolling,).toBeNull();
  });
});
