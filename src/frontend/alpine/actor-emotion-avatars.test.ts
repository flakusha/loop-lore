// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, describe, expect, mock, test, } from "bun:test";
import {
  actorEmotionAvatars,
  actorEmotionAvatarsFactory,
  type ActorEmotionAvatarsState,
  type EmotionAvatarJob,
} from "./actor-emotion-avatars";

// ── Mock ../htmx (must precede importing ./actor-emotion-avatars) ──
type ApiFetchMock = (url: string, opts?: RequestInit,) => Promise<Response>;
let calls: { url: string; opts: RequestInit }[] = [];
let handler: ApiFetchMock = async () => Response.json({},);

mock.module("./htmx", () => ({
  apiFetch: ((url: string, opts?: RequestInit,) => {
    calls.push({ url, opts: opts ?? {}, },);
    return handler(url, opts,);
  }) satisfies ApiFetchMock,
}),);

const baseCtx = (): ActorEmotionAvatarsState => {
  const state = Object.create(actorEmotionAvatars,) as ActorEmotionAvatarsState;
  state._eaActorId = null;
  state.jobs = [];
  state.jobsLoading = false;
  state.jobsError = "";
  state.baseAvatarId = "";
  state.selectedEmotions = [];
  state.promptPrefix = "";
  state.negativePrompt = "";
  state.busy = false;
  state.message = "";
  state.error = "";
  state.pollIntervalMs = 2_000;
  state._pollHandle = null;
  state._pollInterval = null;
  return state;
};

afterEach(() => {
  calls = [];
  handler = async () => Response.json({},);
},);

const sampleJob = (over: Partial<EmotionAvatarJob> = {},): EmotionAvatarJob => ({
  id: "job-1",
  actorId: "actor-1",
  status: "running",
  baseAvatarId: "av-1",
  emotions: ["happy",],
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-01-01T00:00:00Z",
  ...over,
});

describe("actorEmotionAvatars.setActorId", () => {
  test("binds and clears prior state", () => {
    const ctx = baseCtx();
    ctx.setActorId("actor-1",);
    expect(ctx._eaActorId,).toBe("actor-1",);
    expect(ctx.jobs,).toEqual([],);
  });

  test("no-op when actor unchanged", () => {
    const ctx = baseCtx();
    ctx.setActorId("actor-1",);
    ctx.error = "old";
    ctx.setActorId("actor-1",);
    expect(ctx.error,).toBe("old",);
  });
});

describe("actorEmotionAvatars.isJobActive", () => {
  test("returns true for queued/running", () => {
    const ctx = baseCtx();
    expect(ctx.isJobActive(sampleJob({ status: "queued", },),),).toBe(true,);
    expect(ctx.isJobActive(sampleJob({ status: "running", },),),).toBe(true,);
  });

  test("returns false for terminal states", () => {
    const ctx = baseCtx();
    expect(ctx.isJobActive(sampleJob({ status: "completed", },),),).toBe(false,);
    expect(ctx.isJobActive(sampleJob({ status: "failed", },),),).toBe(false,);
    expect(ctx.isJobActive(sampleJob({ status: "cancelled", },),),).toBe(false,);
  });
});

describe("actorEmotionAvatars.listJobs", () => {
  test("no-op without actor", async () => {
    const ctx = baseCtx();
    await ctx.listJobs();
    expect(calls,).toHaveLength(0,);
  });

  test("populates jobs on 200 array", async () => {
    handler = async () => Response.json([sampleJob(), sampleJob({ id: "job-2", },),],);
    const ctx = baseCtx();
    ctx._eaActorId = "actor-1";
    await ctx.listJobs();
    expect(ctx.jobs.length,).toBe(2,);
    expect(ctx.jobsError,).toBe("",);
  });

  test("populates jobs on 200 wrapped payload", async () => {
    handler = async () => Response.json({ data: [sampleJob(),], },);
    const ctx = baseCtx();
    ctx._eaActorId = "actor-1";
    await ctx.listJobs();
    expect(ctx.jobs.length,).toBe(1,);
  });

  test("records error on non-200", async () => {
    handler = async () => Response.json({}, { status: 500, },);
    const ctx = baseCtx();
    ctx._eaActorId = "actor-1";
    await ctx.listJobs();
    expect(ctx.jobsError,).toBeTruthy();
    expect(ctx.jobs,).toEqual([],);
  });

  test("records error on network failure", async () => {
    handler = async () => {
      throw new Error("net",);
    };
    const ctx = baseCtx();
    ctx._eaActorId = "actor-1";
    await ctx.listJobs();
    expect(ctx.jobsError,).toBeTruthy();
  });
});

describe("actorEmotionAvatars.toggleEmotion", () => {
  test("adds emotion to empty selection", () => {
    const ctx = baseCtx();
    ctx.toggleEmotion("happy",);
    expect(ctx.selectedEmotions,).toEqual(["happy",],);
  });

  test("removes emotion when already present", () => {
    const ctx = baseCtx();
    ctx.toggleEmotion("happy",);
    ctx.toggleEmotion("happy",);
    expect(ctx.selectedEmotions,).toEqual([],);
  });

  test("preserves order of independent emotions", () => {
    const ctx = baseCtx();
    ctx.toggleEmotion("happy",);
    ctx.toggleEmotion("sad",);
    expect(ctx.selectedEmotions,).toEqual(["happy", "sad",],);
  });
});

describe("actorEmotionAvatars.startGeneration", () => {
  test("no-op without actor", async () => {
    const ctx = baseCtx();
    ctx.baseAvatarId = "av-1";
    expect(await ctx.startGeneration(),).toBe(false,);
    expect(calls,).toHaveLength(0,);
  });

  test("errors on missing baseAvatarId", async () => {
    const ctx = baseCtx();
    ctx._eaActorId = "actor-1";
    expect(await ctx.startGeneration(),).toBe(false,);
    expect(ctx.error,).toBeTruthy();
    expect(calls,).toHaveLength(0,);
  });

  test("POSTs payload and triggers listJobs", async () => {
    handler = async () => Response.json({ jobId: "job-1", }, { status: 201, },);
    const ctx = baseCtx();
    ctx._eaActorId = "actor-1";
    ctx.baseAvatarId = "av-1";
    ctx.selectedEmotions = ["happy", "sad",];
    ctx.promptPrefix = "p";
    ctx.negativePrompt = "n";
    const ok = await ctx.startGeneration();
    expect(ok,).toBe(true,);
    const postCall = calls.find((c,) => c.opts.method === "POST");
    expect(postCall?.url,).toBe("/api/actors/actor-1/emotion-avatars",);
    expect(JSON.parse(String(postCall?.opts.body ?? "{}",),),).toMatchObject({
      baseAvatarId: "av-1",
      emotions: ["happy", "sad",],
      promptPrefix: "p",
      negativePrompt: "n",
    },);
  });

  test("captures server message on non-200", async () => {
    handler = async () => Response.json({ message: "denied", }, { status: 403, },);
    const ctx = baseCtx();
    ctx._eaActorId = "actor-1";
    ctx.baseAvatarId = "av-1";
    expect(await ctx.startGeneration(),).toBe(false,);
    expect(ctx.error,).toBe("denied",);
  });

  test("records generic error on network failure", async () => {
    handler = async () => {
      throw new Error("net",);
    };
    const ctx = baseCtx();
    ctx._eaActorId = "actor-1";
    ctx.baseAvatarId = "av-1";
    expect(await ctx.startGeneration(),).toBe(false,);
    expect(ctx.error,).toBeTruthy();
  });
});

describe("actorEmotionAvatars.cancelJob", () => {
  test("no-op without actor", async () => {
    const ctx = baseCtx();
    await ctx.cancelJob("job-1",);
    expect(calls,).toHaveLength(0,);
  });

  test("no-op without jobId", async () => {
    const ctx = baseCtx();
    ctx._eaActorId = "actor-1";
    await ctx.cancelJob("",);
    expect(calls,).toHaveLength(0,);
  });

  test("POSTs cancel + refreshes + reloads list", async () => {
    let callIdx = 0;
    handler = async (url: string,) => {
      callIdx++;
      if (url.endsWith("/cancel",) && callIdx === 1) {
        return Response.json({ ok: true, },);
      }
      if (url.endsWith("/jobs/job-1",)) {
        return Response.json(sampleJob({ status: "cancelled", },),);
      }
      if (url.endsWith("/jobs",)) {
        return Response.json([sampleJob({ status: "cancelled", },),],);
      }
      return Response.json({},);
    };
    const ctx = baseCtx();
    ctx._eaActorId = "actor-1";
    ctx.jobs = [sampleJob(),];
    await ctx.cancelJob("job-1",);
    expect(calls.some((c,) => c.opts.method === "POST" && c.url.endsWith("/cancel",)),).toBe(true,);
  });

  test("captures server message on non-200", async () => {
    handler = async () => Response.json({ message: "forbidden", }, { status: 403, },);
    const ctx = baseCtx();
    ctx._eaActorId = "actor-1";
    await ctx.cancelJob("job-1",);
    expect(ctx.error,).toBe("forbidden",);
  });
});

describe("actorEmotionAvatars.refreshJob", () => {
  test("no-op without actor", async () => {
    const ctx = baseCtx();
    await ctx.refreshJob("job-1",);
    expect(calls,).toHaveLength(0,);
  });

  test("replaces existing job by id", async () => {
    handler = async () => Response.json(sampleJob({ status: "completed", },),);
    const ctx = baseCtx();
    ctx._eaActorId = "actor-1";
    ctx.jobs = [sampleJob({ status: "running", },),];
    await ctx.refreshJob("job-1",);
    expect(ctx.jobs[0]?.status,).toBe("completed",);
  });

  test("appends when id missing", async () => {
    handler = async () => Response.json(sampleJob({ id: "job-2", },),);
    const ctx = baseCtx();
    ctx._eaActorId = "actor-1";
    ctx.jobs = [];
    await ctx.refreshJob("job-2",);
    expect(ctx.jobs.length,).toBe(1,);
  });

  test("records nothing on non-200", async () => {
    handler = async () => Response.json({}, { status: 404, },);
    const ctx = baseCtx();
    ctx._eaActorId = "actor-1";
    await ctx.refreshJob("job-1",);
    expect(ctx.jobs,).toEqual([],);
  });
});

describe("actorEmotionAvatars.startPolling / stopPolling", () => {
  test("stopPolling is idempotent", () => {
    const ctx = baseCtx();
    ctx.stopPolling();
    ctx.stopPolling();
    expect(ctx._pollHandle,).toBeNull();
    expect(ctx._pollInterval,).toBeNull();
  });

  test("startPolling then stopPolling clears handles", () => {
    const ctx = baseCtx();
    ctx.startPolling();
    expect(ctx._pollHandle !== null || ctx._pollInterval !== null,).toBe(true,);
    ctx.stopPolling();
    expect(ctx._pollHandle,).toBeNull();
    expect(ctx._pollInterval,).toBeNull();
  });
});

describe("actorEmotionAvatarsFactory", () => {
  test("returns a fresh state bound to the actor", () => {
    const a = actorEmotionAvatarsFactory("actor-a",);
    const b = actorEmotionAvatarsFactory("actor-b",);
    expect(a,).not.toBe(b,);
    expect(a._eaActorId,).toBe("actor-a",);
    expect(b._eaActorId,).toBe("actor-b",);
  });
});
