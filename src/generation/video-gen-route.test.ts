// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Route tests for handleVideoGeneration (generation/video-gen-route.ts):
 * the auth + validation matrix that runs BEFORE the generation engine
 * (401 / 400 / 404 / 403 / 501). Engine dispatch, timeout mapping, and BYO
 * key behavior live in video-engine.test.ts; the happy path through the
 * template seam is covered by routes/templates/modality.test.ts.
 *
 * Resource contract (parallel-safe): one :memory: SQLite per FILE (never a
 * shared db file), torn down in afterAll; fixed row ids (video-route-user,
 * route-chat-1, route-msg-1) are file-local; no ports, no sleeps, no
 * module mocks — tests are order-independent and never reach the engine.
 */
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
 * convention: registered up front, file runs under --isolate in the gate.
 */
import { afterAll, beforeAll, describe, expect, mock, test, } from "bun:test";
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
import * as realVideoEngine from "./video-engine";

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
  persistGeneratedImages: async () => (persistAsset ? [{ asset: persistAsset, duplicate: false, },] : []),
}),);

// Dynamic import: mocks must register before the SUT module evaluates.
const { handleVideoGeneration, } = await import("./video-gen-route");

describe("handleVideoGeneration — pre-engine gates", () => {
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

  test("200 happy path persists the clip and links chat + message", async () => {
    engineOutcome = { ok: true, };
    quotaRefusal = null;
    persistAsset = { id: "video-asset-1", filename: "clip.mp4", mime_type: "video/mp4", };
    await insertChats(db, "Clip chat", "video-route-user", { id: "route-chat-clip", } as never,);
    await insertMessages(db, "route-chat-clip", "route-actor-1", "user", "clip msg", { id: "route-msg-clip", },);

    const res = await handleVideoGeneration(
      { prompt: "a dragon flies", chatId: "route-chat-clip", messageId: "route-msg-clip", },
      db,
      "video-route-user",
      "user",
    );

    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { data: { id: string; provider: string } };
    expect(body.data.id,).toBe("video-asset-1",);
    expect(body.data.provider,).toBe("comfyui:txt2video",);
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

    const res = await handleVideoGeneration(
      { templateId: "video-template-1", context: { subject: "Mira", }, },
      db,
      "video-route-user",
      "user",
    );

    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { data: { id: string } };
    expect(body.data.id,).toBe("video-asset-tpl",);
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

  test("maps an engine failure to its status verbatim", async () => {
    engineOutcome = { ok: false, error: "Video generation timed out after 5000ms", status: 504, };
    quotaRefusal = null;

    const res = await handleVideoGeneration(
      { prompt: "a clip", },
      db,
      "video-route-user",
      "user",
    );

    expect(res.status,).toBe(504,);
    const body = (await res.json()) as { error: string; status: number };
    expect(body.error,).toContain("timed out",);
    engineOutcome = { ok: true, };
  });

  test("500 when persistence yields no asset", async () => {
    engineOutcome = { ok: true, };
    quotaRefusal = null;
    persistAsset = null;

    const res = await handleVideoGeneration(
      { prompt: "a clip", },
      db,
      "video-route-user",
      "user",
    );

    expect(res.status,).toBe(500,);
    persistAsset = { id: "video-asset-1", filename: "clip.mp4", mime_type: "video/mp4", };
  });
});
