// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for generation/cancellation-actions/side-effects.ts — side-effect
 * job registry (TTS / image-queue) for in-flight generation attempts.
 *
 * Covers: register/unregister/list happy paths, duplicate registration,
 * registration after the attempt settled (cancelled), and the fan-out
 * behavior of cancelGeneration over registered jobs (sync throw, async
 * rejection, mixed success).
 */
import { describe, expect, it, } from "bun:test";
import { CancelReason, CancelSource, GenerationStatus, PolicyType, } from "../../db/enums";
import { createLogger, } from "../../logger";
import type { ActiveGeneration, SideEffectJob, } from "../cancellation-tracker";
import { activeGenerations, chatToAttempt, } from "../cancellation-tracker";
import { StreamingRepetitionDetector, } from "../repetition-detector";
import { DEFAULT_REPETITION_DETECTION, } from "../types";
import { cancelGeneration, } from "./cancel";
import { listSideEffectJobs, registerSideEffectJob, unregisterSideEffectJob, } from "./side-effects";

// Initialize logger (side-effects warns on inactive-attempt registration)
createLogger({ level: "error", },);

/** Minimal typed ActiveGeneration factory (mirrors step-pipeline.test.ts). */
function makeActiveGen(overrides: Partial<ActiveGeneration>,): ActiveGeneration {
  const now = Date.now();
  return {
    attemptId: "test",
    chatId: "chat-test",
    parentMessageId: "msg-test",
    actorId: "actor-test",
    abortController: new AbortController(),
    startedAt: now,
    repetitionDetector: new StreamingRepetitionDetector(DEFAULT_REPETITION_DETECTION,),
    policyConfig: { expectedPolicy: PolicyType.Sfw, cancel: false, },
    responseLimitConfig: { maxResponses: 50, isGroupChat: false, currentCount: 0, },
    streaming: false,
    chunksReceived: 0,
    charsReceived: 0,
    status: GenerationStatus.Streaming,
    lastRenderedChunkIndex: -1,
    deliveryConfirmed: false,
    sideEffectJobs: undefined,
    stepIndex: 0,
    totalSteps: 1,
    ...overrides,
  };
}

/** Track calls to a job's cancel handler. */
function trackingJob(id: string, kind: SideEffectJob["kind"], calls: string[],): SideEffectJob {
  return {
    id,
    kind,
    cancel: () => {
      calls.push(id,);
    },
  };
}

/** Activate a generation attempt in the shared tracker maps. */
function activate(attemptId: string, chatId: string,): ActiveGeneration {
  const active = makeActiveGen({ attemptId, chatId, },);
  activeGenerations.set(attemptId, active,);
  chatToAttempt.set(chatId, attemptId,);
  return active;
}

function clearState(): void {
  activeGenerations.clear();
  chatToAttempt.clear();
}

describe("registerSideEffectJob", () => {
  it("returns false when the attempt is not active", () => {
    clearState();
    const calls: string[] = [];
    const result = registerSideEffectJob("ghost", trackingJob("job-1", "tts", calls,),);
    expect(result,).toBe(false,);
    expect(calls,).toEqual([],);
  });

  it("registers a job on an active attempt and lists it", () => {
    clearState();
    activate("att-1", "chat-1",);
    const calls: string[] = [];
    const job = trackingJob("job-1", "tts", calls,);

    expect(registerSideEffectJob("att-1", job,),).toBe(true,);
    expect(listSideEffectJobs("att-1",),).toEqual([job,],);
  });

  it("registers multiple jobs and preserves insertion order", () => {
    clearState();
    activate("att-1", "chat-1",);
    const calls: string[] = [];
    const tts = trackingJob("job-tts", "tts", calls,);
    const img = trackingJob("job-img", "image-queue", calls,);

    expect(registerSideEffectJob("att-1", tts,),).toBe(true,);
    expect(registerSideEffectJob("att-1", img,),).toBe(true,);
    expect(listSideEffectJobs("att-1",),).toEqual([tts, img,],);
  });

  it("overwrites a duplicate job id instead of duplicating it", () => {
    clearState();
    activate("att-1", "chat-1",);
    const first: SideEffectJob = { id: "job-1", kind: "tts", cancel: () => {}, };
    const second: SideEffectJob = { id: "job-1", kind: "image-queue", cancel: () => {}, };

    expect(registerSideEffectJob("att-1", first,),).toBe(true,);
    expect(registerSideEffectJob("att-1", second,),).toBe(true,);

    const jobs = listSideEffectJobs("att-1",);
    expect(jobs,).toHaveLength(1,);
    expect(jobs[0],).toBe(second,);
  });

  it("keeps registries isolated per attempt", () => {
    clearState();
    activate("att-1", "chat-1",);
    activate("att-2", "chat-2",);
    const job = trackingJob("job-1", "other", [],);

    registerSideEffectJob("att-1", job,);
    expect(listSideEffectJobs("att-2",),).toEqual([],);
  });
});

describe("unregisterSideEffectJob", () => {
  it("returns false when the attempt is not active", () => {
    clearState();
    expect(unregisterSideEffectJob("ghost", "job-1",),).toBe(false,);
  });

  it("returns false when the job id is unknown", () => {
    clearState();
    activate("att-1", "chat-1",);
    const calls: string[] = [];
    registerSideEffectJob("att-1", trackingJob("job-1", "tts", calls,),);

    expect(unregisterSideEffectJob("att-1", "missing",),).toBe(false,);
    expect(listSideEffectJobs("att-1",),).toHaveLength(1,);
  });

  it("removes a registered job and reports success", () => {
    clearState();
    activate("att-1", "chat-1",);
    const calls: string[] = [];
    registerSideEffectJob("att-1", trackingJob("job-1", "tts", calls,),);

    expect(unregisterSideEffectJob("att-1", "job-1",),).toBe(true,);
    expect(listSideEffectJobs("att-1",),).toEqual([],);
    expect(unregisterSideEffectJob("att-1", "job-1",),).toBe(false,);
  });

  it("lazily creates the job map without failing on a fresh attempt", () => {
    clearState();
    activate("att-1", "chat-1",);
    expect(unregisterSideEffectJob("att-1", "never-registered",),).toBe(false,);
    expect(listSideEffectJobs("att-1",),).toEqual([],);
  });
});

describe("listSideEffectJobs", () => {
  it("returns an empty array when the attempt is not active", () => {
    clearState();
    expect(listSideEffectJobs("ghost",),).toEqual([],);
  });

  it("returns an empty array for an active attempt with no jobs", () => {
    clearState();
    activate("att-1", "chat-1",);
    expect(listSideEffectJobs("att-1",),).toEqual([],);
  });
});

describe("cancellation fan-out over registered side-effect jobs", () => {
  it("invokes every job cancel handler and clears the attempt", () => {
    clearState();
    const active = activate("att-1", "chat-1",);
    const calls: string[] = [];
    registerSideEffectJob("att-1", trackingJob("job-sync", "tts", calls,),);
    registerSideEffectJob("att-1", trackingJob("job-async", "image-queue", calls,),);

    const result = cancelGeneration({
      attemptId: "att-1",
      reason: CancelReason.UserCancel,
      source: CancelSource.User,
      detail: "stop",
    },);

    expect(result,).toBe(true,);
    expect(calls,).toEqual(["job-sync", "job-async",],);
    expect(active.abortController.signal.aborted,).toBe(true,);
    expect(active.status,).toBe(GenerationStatus.Cancelled,);
    expect(activeGenerations.has("att-1",),).toBe(false,);
    expect(chatToAttempt.has("chat-1",),).toBe(false,);
  });

  it("does not fan out when no side-effect jobs are registered", () => {
    clearState();
    activate("att-1", "chat-1",);

    const result = cancelGeneration({
      attemptId: "att-1",
      reason: CancelReason.UserCancel,
      source: CancelSource.User,
      detail: "stop",
    },);

    expect(result,).toBe(true,);
    expect(activeGenerations.has("att-1",),).toBe(false,);
  });

  it("isolates a synchronously throwing job from its siblings", () => {
    clearState();
    activate("att-1", "chat-1",);
    const calls: string[] = [];
    registerSideEffectJob("att-1", trackingJob("job-ok", "tts", calls,),);
    registerSideEffectJob("att-1", {
      id: "job-boom",
      kind: "other",
      cancel: () => {
        throw new Error("job exploded",);
      },
    },);
    registerSideEffectJob("att-1", trackingJob("job-after", "image-queue", calls,),);

    const result = cancelGeneration({
      attemptId: "att-1",
      reason: CancelReason.UserCancel,
      source: CancelSource.User,
      detail: "stop",
    },);

    expect(result,).toBe(true,);
    expect(calls,).toEqual(["job-ok", "job-after",],);
    expect(activeGenerations.has("att-1",),).toBe(false,);
  });

  it("survives an async cancel rejection without breaking teardown", async () => {
    clearState();
    activate("att-1", "chat-1",);
    const calls: string[] = [];
    registerSideEffectJob("att-1", trackingJob("job-ok", "tts", calls,),);
    registerSideEffectJob("att-1", {
      id: "job-reject",
      kind: "image-queue",
      cancel: () => Promise.reject(new Error("async teardown failed",),),
    },);

    const result = cancelGeneration({
      attemptId: "att-1",
      reason: CancelReason.UserCancel,
      source: CancelSource.User,
      detail: "stop",
    },);

    expect(result,).toBe(true,);
    expect(calls,).toEqual(["job-ok",],);
    expect(activeGenerations.has("att-1",),).toBe(false,);
    // The rejection handler is attached synchronously by cancelGeneration;
    // flush microtasks so the rejection settles inside this test.
    await Promise.resolve();
    await Promise.resolve();
  });
});

describe("registration after the attempt settled", () => {
  it("rejects registration and list falls back to empty once cancelled", () => {
    clearState();
    const active = activate("att-1", "chat-1",);
    registerSideEffectJob("att-1", trackingJob("job-1", "tts", [],),);

    cancelGeneration({
      attemptId: "att-1",
      reason: CancelReason.UserCancel,
      source: CancelSource.User,
      detail: "stop",
    },);

    const late = trackingJob("late-job", "tts", [],);
    expect(registerSideEffectJob("att-1", late,),).toBe(false,);
    expect(unregisterSideEffectJob("att-1", "job-1",),).toBe(false,);
    expect(listSideEffectJobs("att-1",),).toEqual([],);
    expect(active.abortController.signal.aborted,).toBe(true,);
  });

  it("still reports registered jobs before the cancellation fan-out runs", () => {
    clearState();
    activate("att-1", "chat-1",);
    const job = trackingJob("job-1", "tts", [],);
    registerSideEffectJob("att-1", job,);

    expect(listSideEffectJobs("att-1",),).toEqual([job,],);
  });
});
