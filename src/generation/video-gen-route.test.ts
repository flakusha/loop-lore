// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Route tests for handleVideoGeneration (generation/video-gen-route.ts):
 * the auth + validation matrix (401 / 400 / 404 / 403 / 501) plus the
 * template-render, quota, engine-mapping, and persistence branches.
 * Engine internals (timeout mapping, BYO keys) live in video-engine.test.ts.
 *
 * Resource contract (parallel-safe): one :memory: SQLite per FILE (never a
 * shared db file), torn down in afterAll; fixed row ids (video-route-user,
 * route-chat-1, route-msg-1) are file-local; no ports, no sleeps. Module
 * mocks (config load, engine, quota, persist) follow the image-route
 * convention: registered up front under the ISOLATED guard, file runs under
 * --isolate in the gate.
 */
import { afterAll, beforeAll, beforeEach, expect, mock, test, } from "bun:test";
import type { Kysely, } from "kysely";
import * as realPersist from "../assets/service/persist-generated";
import * as realConfigLoad from "../config/load";
import { createConfigSchema, } from "../config/schema-class";
import { StorageBudgetScope, } from "../db/enums";
import type { DB, } from "../db/schema";
import { StorageWriteRefusedError, } from "../federation/storage-quota";
import * as realQuota from "../federation/storage-quota";
import { ErrorCode, } from "../routes/http-utils/status";
import { createTestDb, destroyTestDb, type TestDb, } from "../test-utils/create-test-db";
import { insertActors, insertChats, insertMessages, insertUsers, } from "../test-utils/insert-helpers";
import { describeOrSkip, ISOLATED, } from "../test-utils/isolate-only";
import * as realVideoEngine from "./video-engine";
import type * as videoGenRoute from "./video-gen-route";
import { __resetVideoJobsForTests, storeVideoJob, } from "./video-jobs";

/** Engine outcome the route test controls per case. */
let engineOutcome: { ok: true } | { ok: false; error: string; status: number } = { ok: true, };
/** Quota refusal to throw, or null for the pass-through path. */
let quotaRefusal: StorageWriteRefusedError | null = null;
/** Persisted asset the stub returns; null simulates a persistence miss. */
let persistAsset: { id: string; filename: string; mime_type: string } | null = {
  id: "video-asset-1",
  filename: "clip.mp4",
  mime_type: "video/mp4",
};

/** Video provider list the config stub serves; null = unconfigured (501). */
let videoProviders: Array<Record<string, unknown>> | null = [
  {
    name: "video-test-provider",
    baseUrl: "http://127.0.0.1:8188",
    apiFamily: "comfyui",
    workflow: "txt2video",
    timeout: 1_000,
    generationTimeout: 5_000,
  },
];

// ── Register mocks BEFORE importing the module under test ──────────────────────
//
// Bun's mock.module is process-global for a whole `bun test` invocation and
// cannot be unmocked: without isolation these stubs leak into every later
// test file (an unguarded config stub made the sibling template-route suite
// see a configured video provider, so its "no provider -> 501" case saw the
// async 202 submit instead). The repo convention for such files is
// `describeOrSkip` + an ISOLATED guard: plain `bun test src/` skips
// registration entirely, and the canonical gate (`bun run check` / `test:unit`)
// runs with `--isolate`, where each file gets its own module registry and the
// mocks cannot leak.
if (ISOLATED) {
  mock.module("../config/load", () => ({
    ...realConfigLoad,
    loadConfig: () => ({
      ...structuredClone(createConfigSchema().defaults,),
      assets: { uploadDir: "/tmp", },
      generation: { providers: { video: videoProviders, }, },
    }),
  }),);

  mock.module("./video-engine", () => ({
    ...realVideoEngine,
    generateVideoWithFailover: async () => {
      if (!engineOutcome.ok) { return engineOutcome; }

      return {
        ok: true,
        buffer: Buffer.from("fake-video-bytes",),
        mimeType: "video/mp4",
        providerId: "comfyui:txt2video",
      };
    },
  }),);

  mock.module("../federation/storage-quota", () => ({
    ...realQuota,
    assertGenerationFitsStorage: async () => {
      if (quotaRefusal) { throw quotaRefusal; }
    },
  }),);

  mock.module("../assets/service/persist-generated", () => ({
    ...realPersist,
    persistGeneratedImages: async (opts: {
      links: Array<{ entityType: string; entityId: string; label: string }>;
      assetType?: string;
    },) => {
      lastPersistOpts = { links: opts.links, assetType: opts.assetType, };
      return persistAsset ? [{ asset: persistAsset, duplicate: false, },] : [];
    },
  }),);
}

/** Last opts the persist stub received; null when the render never persisted. */
let lastPersistOpts: {
  links: Array<{ entityType: string; entityId: string; label: string }>;
  assetType?: string;
} | null = null;

// Dynamic import: mocks must register before the SUT module evaluates.
let handleVideoGeneration: typeof videoGenRoute.handleVideoGeneration;
let handleVideoGenerationStatus: typeof videoGenRoute.handleVideoGenerationStatus;

if (ISOLATED) {
  ({ handleVideoGeneration, handleVideoGenerationStatus, } = await import("./video-gen-route"));
}

/**
 * Submit a clip and poll to a terminal state (bounded: ~50 x 10ms ticks).
 * @param body - the submit body
 * @param db - the test database
 * @param userId - the submitting user
 * @returns the terminal poll payload
 */
async function submitAndPoll(body: unknown, db: Kysely<DB>, userId: string,): Promise<{
  submitStatus: number;
  jobId: string;
  terminal: Record<string, unknown>;
}> {
  const submit = await handleVideoGeneration(body, db, userId, "user",);
  const submitBody = (await submit.json()) as { data: { jobId: string; status: string } };
  let terminal: Record<string, unknown> = {};
  for (let tick = 0; tick < 50; tick += 1) {
    const poll = handleVideoGenerationStatus(submitBody.data.jobId, db, userId, "user",);
    const payload = (await poll.json()) as { data: Record<string, unknown> };
    terminal = payload.data;
    if (terminal["status"] !== "pending") { break; }
    await new Promise((resolve,) => setTimeout(resolve, 10,));
  }

  return { submitStatus: submit.status, jobId: submitBody.data.jobId, terminal, };
}

describeOrSkip("handleVideoGeneration — pre-engine gates", () => {
  let testDb: TestDb;
  let db: Kysely<DB>;

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
    await insertUsers(db, "video-route-user", "Video Route User", { id: "video-route-user", } as never,);
    engineOutcome = { ok: true, };
    quotaRefusal = null;
    persistAsset = { id: "video-asset-1", filename: "clip.mp4", mime_type: "video/mp4", };
  },);

  afterAll(() => destroyTestDb(testDb,));

  test("401 without an authenticated user", async () => {
    const res = await handleVideoGeneration({ prompt: "x", }, db,);
    expect(res.status,).toBe(401,);
  });

  test("400 when neither prompt nor template renders one", async () => {
    const res = await handleVideoGeneration({}, db, "video-route-user", "user",);
    expect(res.status,).toBe(400,);
  });

  test("501 when no video provider is configured", async () => {
    videoProviders = null;
    const res = await handleVideoGeneration({ prompt: "a clip", }, db, "video-route-user", "user",);
    expect(res.status,).toBe(501,);
    const body = (await res.json()) as { error: string };
    expect(body.error,).toContain("No video generation provider configured",);
    videoProviders = [
      {
        name: "video-test-provider",
        baseUrl: "http://127.0.0.1:8188",
        apiFamily: "comfyui",
        workflow: "txt2video",
        timeout: 1_000,
        generationTimeout: 5_000,
      },
    ];
  });

  test("403 when the linked chat is unknown to this user (IDOR write guard)", async () => {
    const res = await handleVideoGeneration(
      { prompt: "a clip", chatId: "no-such-chat", },
      db,
      "video-route-user",
      "user",
    );

    expect(res.status,).toBe(403,);
  });

  test("404 when the linked message does not exist", async () => {
    const res = await handleVideoGeneration(
      { prompt: "a clip", messageId: "no-such-message", },
      db,
      "video-route-user",
      "user",
    );

    expect(res.status,).toBe(404,);
  });

  test("400 when the messageId belongs to a different chat than chatId", async () => {
    await insertChats(db, "Route chat", "video-route-user", { id: "route-chat-1", } as never,);
    await insertActors(db, "Route Actor", { id: "route-actor-1", },);
    await insertMessages(db, "route-chat-1", "route-actor-1", "user", "hello", { id: "route-msg-1", },);

    const res = await handleVideoGeneration(
      { prompt: "a clip", messageId: "route-msg-1", chatId: "route-chat-other", },
      db,
      "video-route-user",
      "user",
    );

    expect(res.status,).toBe(400,);
  });

  test("202 submit + poll-to-done persists the clip and links chat + message", async () => {
    engineOutcome = { ok: true, };
    quotaRefusal = null;
    persistAsset = { id: "video-asset-1", filename: "clip.mp4", mime_type: "video/mp4", };
    await insertChats(db, "Clip chat", "video-route-user", { id: "route-chat-clip", } as never,);
    await insertMessages(db, "route-chat-clip", "route-actor-1", "user", "clip msg", { id: "route-msg-clip", },);

    // Async submit flow: 202 with a job id, then poll to done with the
    // same asset shape the old inline 200 returned (persistence + links
    // happen in the background continuation).
    const { submitStatus, terminal, } = await submitAndPoll(
      { prompt: "a dragon flies", chatId: "route-chat-clip", messageId: "route-msg-clip", },
      db,
      "video-route-user",
    );

    expect(submitStatus,).toBe(202,);
    expect(terminal["status"],).toBe("done",);
    const asset = terminal["asset"] as { id: string; provider: string };
    expect(asset.id,).toBe("video-asset-1",);
    expect(asset.provider,).toBe("comfyui:txt2video",);
    // The persist stub records its opts: AC3 pins assetType + both links.
    expect(lastPersistOpts?.assetType,).toBe("video",);
    expect(lastPersistOpts?.links,).toEqual([
      { entityType: "message", entityId: "route-msg-clip", label: "generated", },
      { entityType: "chat", entityId: "route-chat-clip", label: "generated", },
    ],);
  });

  test("404 when templateId names no owned template", async () => {
    const res = await handleVideoGeneration(
      { templateId: "no-such-template", },
      db,
      "video-route-user",
      "user",
    );

    expect(res.status,).toBe(404,);
  });

  test("400 when the owned template is not a video template", async () => {
    await db.insertInto("prompt_templates",).values({
      id: "image-template-1",
      owner_id: "video-route-user",
      name: "Image template",
      modality: "image",
      payload: JSON.stringify({ templateBody: "an image", },),
    } as never,).execute();

    const res = await handleVideoGeneration(
      { templateId: "image-template-1", },
      db,
      "video-route-user",
      "user",
    );

    expect(res.status,).toBe(400,);
  });

  test("400 when the video template payload is malformed", async () => {
    await db.insertInto("prompt_templates",).values({
      id: "broken-video-template",
      owner_id: "video-route-user",
      name: "Broken video",
      modality: "video",
      payload: "not-json",
    } as never,).execute();

    const res = await handleVideoGeneration(
      { templateId: "broken-video-template", },
      db,
      "video-route-user",
      "user",
    );

    expect(res.status,).toBe(400,);
  });

  test("200 when a video template renders the prompt", async () => {
    engineOutcome = { ok: true, };
    quotaRefusal = null;
    persistAsset = { id: "video-asset-tpl", filename: "tpl.mp4", mime_type: "video/mp4", };
    await db.insertInto("prompt_templates",).values({
      id: "video-template-1",
      owner_id: "video-route-user",
      name: "Spell clip",
      modality: "video",
      payload: JSON.stringify({ body: "{{subject}} casts a spell", },),
    } as never,).execute();

    const { submitStatus, terminal, } = await submitAndPoll(
      { templateId: "video-template-1", context: { subject: "Mira", }, },
      db,
      "video-route-user",
    );

    expect(submitStatus,).toBe(202,);
    expect(terminal["status"],).toBe("done",);
    expect((terminal["asset"] as { id: string }).id,).toBe("video-asset-tpl",);
    persistAsset = { id: "video-asset-1", filename: "clip.mp4", mime_type: "video/mp4", };
  });

  test("429 when the storage quota refuses the render", async () => {
    quotaRefusal = new StorageWriteRefusedError("storage quota exceeded", {
      errorCode: ErrorCode.QuotaExceeded,
      scope: StorageBudgetScope.Total,
      limitBytes: 1,
      wouldUseBytes: 2,
    },);

    const res = await handleVideoGeneration(
      { prompt: "a clip", },
      db,
      "video-route-user",
      "user",
    );

    expect(res.status,).toBe(429,);
    quotaRefusal = null;
  });

  test("507 when the asset root is unreachable", async () => {
    quotaRefusal = new StorageWriteRefusedError("storage is unavailable", {
      errorCode: ErrorCode.StorageUnavailable,
      scope: StorageBudgetScope.Total,
      limitBytes: null,
      wouldUseBytes: 1,
    },);

    const res = await handleVideoGeneration(
      { prompt: "a clip", },
      db,
      "video-route-user",
      "user",
    );

    expect(res.status,).toBe(507,);
    quotaRefusal = null;
  });

  test("engine failure surfaces on poll as failed with its status", async () => {
    engineOutcome = { ok: false, error: "Video generation timed out after 5000ms", status: 504, };
    quotaRefusal = null;

    const { submitStatus, terminal, } = await submitAndPoll({ prompt: "a clip", }, db, "video-route-user",);

    expect(submitStatus,).toBe(202,);
    expect(terminal["status"],).toBe("failed",);
    expect(terminal["code"],).toBe(504,);
    expect(terminal["error"],).toContain("timed out",);
    engineOutcome = { ok: true, };
  });

  test("500 when persistence yields no asset", async () => {
    engineOutcome = { ok: true, };
    quotaRefusal = null;
    persistAsset = null;

    const { submitStatus, terminal, } = await submitAndPoll({ prompt: "a clip", }, db, "video-route-user",);

    expect(submitStatus,).toBe(202,);
    expect(terminal["status"],).toBe("failed",);
    expect(terminal["code"],).toBe(500,);
    persistAsset = { id: "video-asset-1", filename: "clip.mp4", mime_type: "video/mp4", };
  });
},);

describeOrSkip("handleVideoGenerationStatus — async poll", () => {
  let statusDb: TestDb;
  let pollDb: Kysely<DB>;

  beforeAll(async () => {
    statusDb = await createTestDb();
    pollDb = statusDb.db;
    await insertUsers(pollDb, "video-status-user", "Video Status User", { id: "video-status-user", },);
    await insertUsers(pollDb, "video-status-other", "Video Status Other", { id: "video-status-other", },);
  },);

  afterAll(() => destroyTestDb(statusDb,));

  beforeEach(() => {
    __resetVideoJobsForTests();
    engineOutcome = { ok: true, };
    quotaRefusal = null;
    persistAsset = { id: "video-asset-1", filename: "clip.mp4", mime_type: "video/mp4", };
    lastPersistOpts = null;
  },);

  test("submit returns 202 + jobId immediately, poll reaches done", async () => {
    // Immediacy: the submit response returns while the render is still
    // in flight — the first poll must observe pending, not a settled job.
    const submit = await handleVideoGeneration({ prompt: "a clip", }, pollDb, "video-status-user", "user",);
    expect(submit.status,).toBe(202,);
    const submitBody = (await submit.json()) as { data: { jobId: string; status: string } };
    expect(submitBody.data.status,).toBe("pending",);
    expect(typeof submitBody.data.jobId,).toBe("string",);

    const { terminal, } = await submitAndPoll({ prompt: "a clip", }, pollDb, "video-status-user",);
    expect(terminal["status"],).toBe("done",);
  });

  test("done poll returns id/url/filename/mimeType/provider", async () => {
    const { terminal, } = await submitAndPoll({ prompt: "a clip", }, pollDb, "video-status-user",);
    expect(terminal["status"],).toBe("done",);
    const asset = terminal["asset"] as Record<string, unknown>;
    expect(asset["id"],).toBe("video-asset-1",);
    expect(asset["url"],).toBe("/api/v1/assets/video-asset-1/raw",);
    expect(asset["filename"],).toBe("clip.mp4",);
    expect(asset["mimeType"],).toBe("video/mp4",);
    expect(asset["provider"],).toBe("comfyui:txt2video",);
  });

  test("401 without an authenticated user", () => {
    const res = handleVideoGenerationStatus("any-job", pollDb,);
    expect(res.status,).toBe(401,);
  });

  test("404 for an unknown job id", () => {
    const res = handleVideoGenerationStatus("no-such-job", pollDb, "video-status-user", "user",);
    expect(res.status,).toBe(404,);
  });

  test("404 for another user's job (oracle rule)", async () => {
    const submit = await handleVideoGeneration({ prompt: "a clip", }, pollDb, "video-status-user", "user",);
    const submitBody = (await submit.json()) as { data: { jobId: string } };

    const res = handleVideoGenerationStatus(submitBody.data.jobId, pollDb, "video-status-other", "user",);
    expect(res.status,).toBe(404,);
  });

  test("expired pending job polls failed with timeout code 504", async () => {
    // Deterministic: inject an aged pending job via the store seam — no
    // race with the background continuation, no tiny-timeout flakiness.
    storeVideoJob({
      id: "aged-video-job",
      ownerId: "video-status-user",
      status: "pending",
      request: { prompt: "a clip", },
      providers: [],
      deadline: Date.now() - 1,
      createdAt: Date.now() - 10_000,
    },);

    const res = handleVideoGenerationStatus("aged-video-job", pollDb, "video-status-user", "user",);
    const body = (await res.json()) as { data: { status: string; code: number; error: string } };
    expect(body.data.status,).toBe("failed",);
    expect(body.data.code,).toBe(504,);
    expect(body.data.error,).toContain("timed out",);
  });

  test("engine failure polls failed with the engine code", async () => {
    engineOutcome = { ok: false, error: "boom", status: 502, };
    const { submitStatus, terminal, } = await submitAndPoll(
      { prompt: "a clip", },
      pollDb,
      "video-status-user",
    );

    expect(submitStatus,).toBe(202,);
    expect(terminal["status"],).toBe("failed",);
    expect(terminal["code"],).toBe(502,);
    expect(terminal["error"],).toBe("boom",);
  });
},);
