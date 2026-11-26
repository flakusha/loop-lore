// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, beforeEach, describe, expect, mock, test, } from "bun:test";
import { randomUUID, } from "node:crypto";
import { type AsyncStore, createAsyncStore, } from "../async/store";
import { setStore, } from "../async/store-registry";
import { createTestDb, destroyTestDb, type TestDb, } from "../test-utils/create-test-db";
import {
  DEFER_DEFAULT_MS,
  DEFER_MAX_MS,
  DEFER_MIN_MS,
  handleJobCancel,
  handleJobDefer,
  handleJobRetry,
  parseDeferTarget,
} from "./job-control";
import {
  __resetVideoJobsForTests,
  getVideoJob,
  pumpDueVideoJobs,
  storeVideoJob,
  type VideoJob,
} from "./video-jobs";

// Resource contract: every test owns an in-memory DB, a fresh async store and
// random ids. The shared in-memory job map is cleared in afterEach.
describe("generation job control", () => {
  let fixture: TestDb;
  let store: AsyncStore;

  beforeEach(async () => {
    fixture = await createTestDb();
    store = createAsyncStore(fixture.db, {},);
    setStore(store,);
  },);

  afterEach(async () => {
    setStore(null,);
    store.destroy();
    __resetVideoJobsForTests();
    await destroyTestDb(fixture,);
  },);

  /** @param ownerId @param overrides @returns a fresh pending job */
  function makeJob(ownerId: string, overrides: Partial<VideoJob> = {},): VideoJob {
    return {
      id: randomUUID(),
      ownerId,
      status: "pending",
      request: { prompt: "a clip", },
      providers: [],
      deadline: Date.now() + 60_000,
      createdAt: Date.now(),
      ...overrides,
    };
  }

  test("user A cannot cancel, defer or retry user B's job", async () => {
    const cancel = mock(async () => {},);
    const foreign = makeJob("user-b", { cancel, },);
    storeVideoJob(foreign,);
    const deps = {
      database: fixture.db,
      submit: mock(async () => new Response(null, { status: 202, },)),
    };

    expect((await handleJobCancel(foreign.id, "user-a",)).status,).toBe(404,);
    expect((await handleJobDefer(foreign.id, "user-a", {},)).status,).toBe(404,);
    expect((await handleJobRetry(foreign.id, "user-a", deps,)).status,).toBe(404,);

    expect(foreign.status,).toBe("pending",);
    expect(cancel,).not.toHaveBeenCalled();
    expect(await foreign.deferred,).toBeUndefined();
  });

  test("cancel is idempotent and calls the live run closure once", async () => {
    const cancel = mock(async () => {},);
    const job = makeJob("user-a", { cancel, },);
    storeVideoJob(job,);

    const first = await handleJobCancel(job.id, "user-a",);
    const second = await handleJobCancel(job.id, "user-a",);

    expect(first.status,).toBe(200,);
    expect(await first.json(),).toEqual({ data: { jobId: job.id, status: "cancelled", }, },);
    expect(second.status,).toBe(200,);
    expect(cancel,).toHaveBeenCalledTimes(1,);
    expect(job.errorStatus,).toBe(499,);
  });

  test("defer records scheduledFor on the async job record and is idempotent", async () => {
    const job = makeJob("user-a",);
    storeVideoJob(job,);
    // Mirror the submit route: the async row is tracked before defer writes.
    store.track({ id: job.id, method: "POST", routePattern: "/api/v1/generation/video", userId: "user-a", },);
    const at = Date.now() + 60_000;

    const first = await handleJobDefer(job.id, "user-a", { scheduledFor: at, },);
    const second = await handleJobDefer(job.id, "user-a", { scheduledFor: at + 5_000, },);

    expect(first.status,).toBe(200,);
    expect((await first.json()).data.scheduledFor,).toBe(at,);
    expect((await second.json()).data.scheduledFor,).toBe(at,);

    await store.flush();
    const row = await store.readOwned!(job.id, { userId: "user-a", },);
    expect(row?.deferred,).toBe(true,);
    expect(row?.scheduledFor,).toBe(at,);
  });

  test("a due deferred job resumes through its stored closure on the lazy pump", async () => {
    const resume = mock(() => {},);
    const job = makeJob("user-a", { resume, },);
    storeVideoJob(job,);
    store.track({ id: job.id, method: "POST", routePattern: "/api/v1/generation/video", userId: "user-a", },);
    await handleJobDefer(job.id, "user-a", { scheduledFor: Date.now() + 60_000, },);

    // Fast-forward: the pump is time-driven, not daemon-driven.
    job.scheduledFor = Date.now() - 1;
    pumpDueVideoJobs();

    expect(resume,).toHaveBeenCalledTimes(1,);
    expect(job.deferred,).toBe(false,);
    await store.flush();
    const row = await store.readOwned!(job.id, { userId: "user-a", },);
    expect(row?.deferred,).toBe(false,);
  });

  test("retry resubmits a terminal job once; a running job is not retryable", async () => {
    const job = makeJob("user-b", { ownerId: "user-a", status: "failed", },);
    storeVideoJob(job,);
    const submit = mock(
      async () => Response.json({ data: { jobId: "new-job", }, }, { status: 202, },),
    );

    const deps = { database: fixture.db, submit, };

    const first = await handleJobRetry(job.id, "user-a", deps,);
    const second = await handleJobRetry(job.id, "user-a", deps,);

    expect(first.status,).toBe(202,);
    expect((await second.json()).data.jobId,).toBe("new-job",);
    expect(submit,).toHaveBeenCalledTimes(1,);

    const running = makeJob("user-a",);
    storeVideoJob(running,);
    expect((await handleJobRetry(running.id, "user-a", deps,)).status,).toBe(409,);
  });

  test("control routes require an authenticated caller", async () => {
    const job = makeJob("user-a",);
    storeVideoJob(job,);
    const deps = {
      database: fixture.db,
      submit: mock(async () => new Response(null, { status: 202, },)),
    };

    expect((await handleJobCancel(job.id, undefined,)).status,).toBe(401,);
    expect((await handleJobDefer(job.id, undefined, {},)).status,).toBe(401,);
    expect((await handleJobRetry(job.id, undefined, deps,)).status,).toBe(401,);
  });

  test("defer without a timestamp uses the default delay; a malformed target is rejected", async () => {
    const job = makeJob("user-a",);
    const other = makeJob("user-a",);
    storeVideoJob(job,);
    storeVideoJob(other,);

    const before = Date.now();
    const res = await handleJobDefer(job.id, "user-a", {},);
    const after = Date.now();
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { data: { scheduledFor: number } };
    expect(body.data.scheduledFor,).toBeGreaterThanOrEqual(before + DEFER_DEFAULT_MS,);
    expect(body.data.scheduledFor,).toBeLessThanOrEqual(after + DEFER_DEFAULT_MS,);
    expect(getVideoJob(job.id,)?.scheduledFor,).toBe(body.data.scheduledFor,);

    const bad = await handleJobDefer(other.id, "user-a", { scheduledFor: "tomorrow", },);
    expect(bad.status,).toBe(400,);
    expect(getVideoJob(other.id,)?.deferred,).toBeUndefined();
  });

  test("parseDeferTarget accepts the inclusive delay window and rejects invalid input", () => {
    const now = 1_700_000_000_000;

    expect(parseDeferTarget(undefined, now,),).toBeNull();
    expect(parseDeferTarget(null, now,),).toBeNull();
    expect(parseDeferTarget(now + DEFER_MIN_MS, now,),).toBe(now + DEFER_MIN_MS,);
    expect(parseDeferTarget(now + DEFER_MAX_MS, now,),).toBe(now + DEFER_MAX_MS,);
    expect(parseDeferTarget(now + DEFER_MIN_MS - 1, now,),).toBeUndefined();
    expect(parseDeferTarget(now + DEFER_MAX_MS + 1, now,),).toBeUndefined();
    expect(parseDeferTarget(now - 1, now,),).toBeUndefined();
    expect(parseDeferTarget("tomorrow", now,),).toBeUndefined();
    expect(parseDeferTarget(Number.NaN, now,),).toBeUndefined();
    expect(parseDeferTarget(Number.POSITIVE_INFINITY, now,),).toBeUndefined();
  });
});
