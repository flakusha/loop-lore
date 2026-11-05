// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the video engine (generation/video-engine.ts): workflow-based
 * ComfyUI dispatch, sink selection, error mapping, and BYO key resolution.
 * Loader INJECTED (bun's mock.module leaks across files); fetch swapped per
 * withMockFetch body only, restored in `finally`; the localhost baseUrl is
 * never dialed; the BYO suite's :memory: DB is per-file (afterAll teardown),
 * its fixed row ids file-local; no test shares state — order-independent.
 * The real loader singleton is never touched (its async scan races other
 * files that bind it, e.g. image-engine).
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Config, VideoProviderConfig, } from "../config/schema";
import { encryptValue, } from "../crypto";
import { VideoApiFamily, } from "../db/enums-config";
import { createTestDb, destroyTestDb, type TestDb, } from "../test-utils/create-test-db";
import { insertUsers, } from "../test-utils/insert-helpers";
import type { UserApiKeyResolver, } from "./providers/types";
import { ByoKeyDecryptError, userApiKeyResolver, } from "./providers/user-api-key";
import { generateVideoWithFailover, } from "./video-engine";

function provider(
  name: string,
  workflow = "txt2video",
  overrides: Partial<VideoProviderConfig> = {},
): VideoProviderConfig {
  return {
    name,
    baseUrl: "http://localhost:8188",
    apiFamily: VideoApiFamily.Comfyui,
    workflow,
    timeout: 1000,
    generationTimeout: 1000,
    ...overrides,
  };
}

const REQUEST = { prompt: "a dragon flies", seconds: 4, };

/** Workflow graph the injected loader returns (shape only — never submitted). */
const LOADED_WORKFLOW = { "9": { inputs: {}, class_type: "SaveVideo", }, };

/** Loader stubs: happy paths get LOADED_WORKFLOW; failingLoader = unknown name. */
const stubLoader = async () => LOADED_WORKFLOW;
const failingLoader = async () => {
  throw new Error('Workflow "missing" not found',);
};

type FetchHandler = (url: string, init?: RequestInit,) => Response | Promise<Response>;

/** Swap globalThis.fetch for the duration of `fn`. */
async function withMockFetch(handler: FetchHandler, fn: () => Promise<void>,): Promise<void> {
  const original = globalThis.fetch;
  (globalThis as Record<string, unknown>).fetch = handler;
  try {
    await fn();
  } finally {
    (globalThis as Record<string, unknown>).fetch = original;
  }
}

const MP4_BYTES = new Uint8Array([0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32,],);

/** History body for a completed prompt with one video sink. */
function completedHistory(promptId: string, filename: string,): Response {
  return Response.json({
    [promptId]: { status: "completed", outputs: { "9": { videos: [{ filename, },], }, }, },
  },);
}

/** Happy-path ComfyUI surface: prompt → completed history → view bytes. */
function happyFetch(promptId: string, filename: string, onPrompt?: (init?: RequestInit,) => void,): FetchHandler {
  return async (url, init,) => {
    const target = String(url,);
    if (target.includes("/prompt",)) {
      onPrompt?.(init,);

      return Response.json({ prompt_id: promptId, },);
    }

    if (target.includes("/history",)) { return completedHistory(promptId, filename,); }
    if (target.includes("/view",)) { return new Response(MP4_BYTES,); }

    return new Response("unexpected", { status: 404, },);
  };
}

describe("generateVideoWithFailover — run outcomes (injected loader)", () => {
  test("answers 501 when no video provider is configured", async () => {
    const outcome = await generateVideoWithFailover(undefined, REQUEST,);

    expect(outcome.ok,).toBe(false,);
    if (outcome.ok) { return; }
    expect(outcome.status,).toBe(501,);
    expect(outcome.error,).toContain("No video generation provider configured",);
  });

  test("maps an unloadable workflow to 500", async () => {
    const outcome = await generateVideoWithFailover(
      [provider("v1", "missing",),],
      REQUEST,
      undefined,
      failingLoader,
    );

    expect(outcome.ok,).toBe(false,);
    if (outcome.ok) { return; }
    expect(outcome.status,).toBe(500,);
    expect(outcome.error,).toContain("missing",);
  });

  test("returns the video sink with its mime type", async () => {
    await withMockFetch(happyFetch("p1", "out.mp4",), async () => {
      const outcome = await generateVideoWithFailover([provider("v1",),], REQUEST, undefined, stubLoader,);

      expect(outcome.ok,).toBe(true,);
      if (!outcome.ok) { return; }
      expect(outcome.mimeType,).toBe("video/mp4",);
      expect(outcome.providerId,).toBe("comfyui:txt2video",);
      expect(outcome.buffer,).toEqual(Buffer.from(MP4_BYTES,),);
    },);
  });

  test("maps a video-less output to 503", async () => {
    await withMockFetch(async (url,) => {
      const target = String(url,);
      if (target.includes("/prompt",)) { return Response.json({ prompt_id: "p1", },); }
      if (target.includes("/history",)) {
        return Response.json({
          p1: { status: "completed", outputs: { "9": { images: [{ filename: "f.png", },], }, }, },
        },);
      }

      return new Response("unexpected", { status: 404, },);
    }, async () => {
      const outcome = await generateVideoWithFailover([provider("v1",),], REQUEST, undefined, stubLoader,);

      expect(outcome.ok,).toBe(false,);
      if (outcome.ok) { return; }
      expect(outcome.status,).toBe(503,);
    },);
  });

  test("maps a failed execution to 502 and fails over to the next candidate", async () => {
    await withMockFetch(async (url,) => {
      const target = String(url,);
      if (target.includes("/prompt",)) {
        return Response.json({ prompt_id: target.includes("8188",) ? "pa" : "pb", },);
      }

      if (target.includes("/history/pa",)) {
        return Response.json({ pa: { status: "failed", error: "node 9 exploded", }, },);
      }

      if (target.includes("/history",)) { return completedHistory("pb", "b.webm",); }
      if (target.includes("/view",)) { return new Response(MP4_BYTES,); }

      return new Response("unexpected", { status: 404, },);
    }, async () => {
      const first = { ...provider("v1",), baseUrl: "http://localhost:8188", };
      const second = { ...provider("v2",), baseUrl: "http://localhost:8189", };
      const outcome = await generateVideoWithFailover([first, second,], REQUEST, undefined, stubLoader,);

      expect(outcome.ok,).toBe(true,);
      if (!outcome.ok) { return; }
      expect(outcome.mimeType,).toBe("video/webm",);
    },);
  });

  test("maps a poll deadline to 504", async () => {
    await withMockFetch(async (url,) => {
      const target = String(url,);
      if (target.includes("/prompt",)) { return Response.json({ prompt_id: "p1", },); }

      return Response.json({/* never completes */},);
    }, async () => {
      const outcome = await generateVideoWithFailover(
        [provider("v1", "txt2video", { generationTimeout: 40, },),],
        REQUEST,
        undefined,
        stubLoader,
      );

      expect(outcome.ok,).toBe(false,);
      if (outcome.ok) { return; }
      expect(outcome.status,).toBe(504,);
      expect(outcome.error,).toContain("timed out",);
    },);
  });
});

describe("generateVideoWithFailover — BYO keys", () => {
  let testDb: TestDb;

  beforeAll(async () => {
    testDb = await createTestDb();
    await insertUsers(testDb.db, "video-byok-user", "Video BYOK User", { id: "video-byok-user", },);
  },);

  afterAll(() => destroyTestDb(testDb,));

  /** Store one BYO key row for the describe's user. */
  async function storeKey(providerName: string, encrypted: string,): Promise<void> {
    await testDb.db.insertInto("user_api_keys",).values({
      id: crypto.randomUUID(),
      user_id: "video-byok-user",
      provider_name: providerName,
      api_key_encrypted: encrypted,
    },).execute();
  }

  /** Resolver over a config exposing exactly one provider (BYO enabled). */
  function resolverFor(providerName: string,): UserApiKeyResolver {
    const config = {
      byoKey: { enabled: true, encryptionKey: "video-engine-byok-secret", },
      generation: { providers: { video: [provider(providerName,),], }, },
    } as unknown as Config;

    return userApiKeyResolver({ userId: "video-byok-user", config, db: testDb.db, },);
  }

  test("a corrupt stored video key fails closed — the operator key is never billed", async () => {
    await storeKey("v1", "corrupt-video-ciphertext",);
    const resolve = resolverFor("v1",);

    // The decrypt failure must throw BEFORE any backend call.
    await expect(
      generateVideoWithFailover([provider("v1",),], REQUEST, resolve, stubLoader,),
    ).rejects.toThrow(ByoKeyDecryptError,);
  });

  test("resolves the user's stored credential and sends it as a Bearer header", async () => {
    await storeKey("v2", await encryptValue("sk-video-byo", "video-engine-byok-secret",),);
    const resolve = resolverFor("v2",);
    const inits: (RequestInit | undefined)[] = [];

    await withMockFetch(
      happyFetch("p2", "c.webm", (init,) => inits.push(init,),),
      async () => {
        const outcome = await generateVideoWithFailover([provider("v2",),], REQUEST, resolve, stubLoader,);

        expect(outcome.ok,).toBe(true,);
        const headers = (inits[0]?.headers ?? {}) as Record<string, string>;
        expect(headers.authorization,).toBe("Bearer sk-video-byo",);
      },
    );
  });
});
