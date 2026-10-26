// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shared sd.cpp job transport (BUG-sdcpp-duplication,
 * BUG-sd-server-image-providers-abort).
 *
 * Runs against a real loopback socket so the submit → poll → terminal-status
 * walk exercises the actual HTTP mapping. The two failure-tolerance contracts
 * pinned here are the ones that regressed before: a single bad poll must not
 * discard a job, and poll failures only abort after
 * `MAX_CONSECUTIVE_POLL_FAILURES` in a row.
 */
import { afterEach, describe, expect, test, } from "bun:test";
import {
  DEFAULT_SDSERVER_JOB_TIMEOUT_MS,
  MAX_CONSECUTIVE_POLL_FAILURES,
  runSdServerJob,
  sdServerAuthHeaders,
  SdServerJobError,
} from "./sd-server-jobs";

interface PollReply {
  status: number;
  body?: unknown;
}

interface JobPeer {
  /** Replies for successive GETs of the job URL; the last one repeats. */
  polls: PollReply[];
  submitStatus?: number;
  submitBody?: unknown;
}

interface RecordedRequest {
  method: string;
  pathname: string;
  authorization: string | null;
  contentType: string | null;
}

// RESOURCE CONTRACT: this file owns loopback listeners only (one per
// `serveJob` call, always on port 0) and no DB. Every listener is stopped in
// `afterEach`, including one a test opened and never used, so a failed
// assertion cannot leak a socket into a sibling file.
const servers: Array<ReturnType<typeof Bun.serve>> = [];

afterEach(() => {
  for (const running of servers.splice(0,)) { running.stop(true,); }
},);

/** Start an sd.cpp-shaped peer and record every request it receives. */
function serveJob(peer: JobPeer,): { baseUrl: string; requests: RecordedRequest[] } {
  const requests: RecordedRequest[] = [];
  let pollIndex = 0;

  const running = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(request,) {
      const { pathname, } = new URL(request.url,);
      requests.push({
        method: request.method,
        pathname,
        authorization: request.headers.get("authorization",),
        contentType: request.headers.get("content-type",),
      },);

      // Any POST is the submit hop; the GETs are job polls.
      if (request.method === "POST") {
        return Response.json(
          peer.submitBody ?? { id: "job-1", },
          { status: peer.submitStatus ?? 200, },
        );
      }

      const reply = peer.polls[Math.min(pollIndex, peer.polls.length - 1,)]!;
      pollIndex += 1;
      return Response.json(reply.body ?? {}, { status: reply.status, },);
    },
  },);

  servers.push(running,);
  return { baseUrl: `http://127.0.0.1:${running.port}`, requests, };
}

/** Await a rejection and narrow it to an `SdServerJobError`. */
async function jobError(pending: Promise<unknown>,): Promise<SdServerJobError> {
  const error = await pending.then(
    (value,) => {
      throw new Error(`expected a rejection, got ${JSON.stringify(value,)}`,);
    },
    (reason: unknown,) => reason,
  );

  expect(error,).toBeInstanceOf(SdServerJobError,);
  return error as SdServerJobError;
}

describe("runSdServerJob", () => {
  test("submits, polls, and returns the finished job's images", async () => {
    const { baseUrl, requests, } = serveJob({
      polls: [
        { status: 200, body: { status: "running", progress: 0.5, }, },
        { status: 200, body: { status: "done", images: ["img-a", "img-b",], }, },
      ],
    },);

    const progress: Array<number | undefined> = [];

    // generationTimeoutMs omitted on purpose: this runs on the shared default.
    const images = await runSdServerJob({
      baseUrl,
      endpoint: "img_gen",
      body: { prompt: "a tiny castle", },
      onProgress: (value,) => progress.push(value,),
    },);

    expect(images,).toEqual(["img-a", "img-b",],);
    expect(progress,).toEqual([0.1, 0.5,],);
    expect(requests.map((r,) => `${r.method} ${r.pathname}`),).toEqual([
      "POST /sdcpp/v1/img_gen",
      "GET /sdcpp/v1/jobs/job-1",
      "GET /sdcpp/v1/jobs/job-1",
    ],);
  });

  test("tolerates a transient poll failure instead of aborting the job", async () => {
    const { baseUrl, requests, } = serveJob({
      polls: [
        { status: 503, },
        { status: 200, body: { status: "done", images: ["img-a",], }, },
      ],
    },);

    const images = await runSdServerJob({
      baseUrl,
      endpoint: "txt2img",
      body: "{}",
      generationTimeoutMs: 30_000,
    },);

    expect(images,).toEqual(["img-a",],);
    expect(requests.length,).toBe(3,);
  });

  test("aborts after MAX_CONSECUTIVE_POLL_FAILURES failed polls in a row", async () => {
    const { baseUrl, requests, } = serveJob({ polls: [{ status: 500, },], },);

    const error = await jobError(
      runSdServerJob({ baseUrl, endpoint: "img_gen", body: {}, generationTimeoutMs: 30_000, },),
    );

    expect(error.status,).toBe(502,);
    expect(error.message,).toContain(`polling failed ${MAX_CONSECUTIVE_POLL_FAILURES}x`,);
    // One submit plus exactly the tolerated number of polls — not one more.
    expect(requests.length,).toBe(1 + MAX_CONSECUTIVE_POLL_FAILURES,);
  });

  test("a terminal failed/cancelled status is a 502 carrying the peer's detail", async () => {
    for (
      const status of ["failed", "cancelled",]
    ) {
      const { baseUrl, } = serveJob({
        polls: [{ status: 200, body: { status, error: "out of memory", }, },],
      },);

      const error = await jobError(
        runSdServerJob({ baseUrl, endpoint: "img_gen", body: {}, generationTimeoutMs: 30_000, },),
      );

      expect(error.status,).toBe(502,);
      expect(error.message,).toContain(`job ${status}: out of memory`,);
    }
  });

  test("done without images is a 502 rather than an empty result", async () => {
    const { baseUrl, } = serveJob({ polls: [{ status: 200, body: { status: "done", images: [], }, },], },);

    const error = await jobError(
      runSdServerJob({ baseUrl, endpoint: "img_gen", body: {}, generationTimeoutMs: 30_000, },),
    );

    expect(error.status,).toBe(502,);
    expect(error.message,).toContain("completed but no images",);
  });

  test("submission failures and a missing job id are 502s", async () => {
    const failedSubmit = serveJob({ polls: [{ status: 200, },], submitStatus: 500, },);
    expect(
      (await jobError(runSdServerJob({ baseUrl: failedSubmit.baseUrl, endpoint: "img_gen", body: {}, },),)).status,
    ).toBe(502,);

    expect(failedSubmit.requests.length,).toBe(1,);

    const noId = serveJob({ polls: [{ status: 200, },], submitBody: {}, },);
    const error = await jobError(
      runSdServerJob({ baseUrl: noId.baseUrl, endpoint: "img_gen", body: {}, },),
    );

    expect(error.status,).toBe(502,);
    expect(error.message,).toContain("no job id",);
  });

  test("an expired deadline is a 504 without polling", async () => {
    const { baseUrl, requests, } = serveJob({
      polls: [{ status: 200, body: { status: "done", images: ["late",], }, },],
    },);

    const error = await jobError(
      runSdServerJob({ baseUrl, endpoint: "img_gen", body: {}, generationTimeoutMs: 0, },),
    );

    expect(error.status,).toBe(504,);
    expect(error.message,).toContain("timed out",);
    expect(requests.length,).toBe(1,);
  });

  test("sends JSON content type and forwards the auth headers it is given", async () => {
    const { baseUrl, requests, } = serveJob({
      polls: [{ status: 200, body: { status: "done", images: ["img-a",], }, },],
    },);

    await runSdServerJob({
      baseUrl,
      endpoint: "img2img",
      body: { prompt: "edit", },
      headers: sdServerAuthHeaders("s3cret",),
      generationTimeoutMs: 30_000,
    },);

    expect(requests[0]?.contentType,).toBe("application/json",);
    expect(requests[0]?.authorization,).toBe("Bearer s3cret",);
    // The poll is a plain GET: no auth leak onto the status endpoint.
    expect(requests[1]?.authorization,).toBeNull();
  });
});

describe("sd-server job constants", () => {
  test("the shared default deadline is a positive millisecond budget", () => {
    expect(Number.isInteger(DEFAULT_SDSERVER_JOB_TIMEOUT_MS,),).toBe(true,);
    expect(DEFAULT_SDSERVER_JOB_TIMEOUT_MS,).toBeGreaterThan(0,);
  });

  test("more than one poll failure is tolerated before aborting", () => {
    expect(MAX_CONSECUTIVE_POLL_FAILURES,).toBeGreaterThan(1,);
  });

  test("sdServerAuthHeaders builds a bearer header only when a key exists", () => {
    expect(sdServerAuthHeaders(undefined,),).toEqual({},);
    expect(sdServerAuthHeaders("",),).toEqual({},);
    expect(sdServerAuthHeaders("abc",),).toEqual({ Authorization: "Bearer abc", },);
  });
});
