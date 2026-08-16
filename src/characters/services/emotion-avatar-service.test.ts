/**
 * Emotion Avatar Service Tests
 *
 * Tests metadata extraction, emotion tag propagation, API routing,
 * and batch job lifecycle for emotion avatar generation.
 */

import { afterEach, beforeAll, describe, expect, it, mock, } from "bun:test";
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import { extractImageMetadata, } from "../../assets/metadata";
import {
  makeMinimalJpeg,
  makeMinimalJpegWithCaption,
  makeMinimalPng,
  makeMinimalPngWithCaption,
  makeMinimalWebp,
} from "../../assets/test-helpers";
import { EmotionType, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { AvatarService, } from "./avatar-service";
import { EmotionAvatarService, } from "./emotion-avatar-service";
import { createTestActors, } from "./test-helpers";

// ── Mocks ──────────────────────────────────────────────────────

const originalFetch = globalThis.fetch;

/** Mock fetch — caller provides (url, init?) → Response */
function mockFetch(handler: (url: string, init?: RequestInit,) => Response | Promise<Response>,) {
  const mocked = mock(async (url: string | URL | Request, _init?: RequestInit,) => {
    const urlStr = typeof url === "string" ? url : (url instanceof URL ? url.href : url.url);
    return handler(urlStr, _init,);
  },);
  Object.defineProperty(globalThis, "fetch", { value: mocked, writable: true, configurable: true, },);
}

function restoreFetch() {
  Object.defineProperty(globalThis, "fetch", { value: originalFetch, writable: true, configurable: true, },);
}

// ── Tests ──────────────────────────────────────────────────────

describe("EmotionAvatarService", () => {
  let db: Kysely<DB>;
  let sqlite: { close(): void; run(sql: string,): void };
  let emotionService: EmotionAvatarService;
  let testActorId: string;

  beforeAll(async () => {
    const testDb = await createTestDb();
    db = testDb.db;
    sqlite = testDb.sqlite;
    emotionService = new EmotionAvatarService(db,);

    const { actorId, } = await createTestActors(db, "test-actor-emotion-001",);
    testActorId = actorId;
  },);

  afterEach(() => {
    restoreFetch();
  },);

  // ── Metadata extraction (unit) ──────────────────────────────────

  describe("metadata extraction", () => {
    it("extracts dimensions from PNG buffer", () => {
      const buf = makeMinimalPng(512, 512,);
      const meta = extractImageMetadata(new Uint8Array(buf,),);
      expect(meta.format,).toBe("png",);
      expect(meta.width,).toBe(512,);
      expect(meta.height,).toBe(512,);
    });

    it("extracts dimensions from JPEG buffer", () => {
      const buf = makeMinimalJpeg(768, 1024,);
      const meta = extractImageMetadata(new Uint8Array(buf,),);
      expect(meta.format,).toBe("jpeg",);
      expect(meta.width,).toBe(768,);
      expect(meta.height,).toBe(1024,);
    });

    it("extracts dimensions from WebP buffer", () => {
      const buf = makeMinimalWebp(256, 256,);
      const meta = extractImageMetadata(new Uint8Array(buf,),);
      expect(meta.format,).toBe("webp",);
      expect(meta.width,).toBe(256,);
      expect(meta.height,).toBe(256,);
    });

    it("extracts caption from PNG tEXt chunk", () => {
      const buf = makeMinimalPngWithCaption("A smiling face", 100, 100,);
      const meta = extractImageMetadata(new Uint8Array(buf,),);
      expect(meta.caption,).toBe("A smiling face",);
    });

    it("extracts caption from JPEG COM marker", () => {
      const buf = makeMinimalJpegWithCaption("Portrait of a character", 200, 300,);
      const meta = extractImageMetadata(new Uint8Array(buf,),);
      expect(meta.caption,).toBe("Portrait of a character",);
    });
  });

  // ── API family routing ─────────────────────────────────────────
  // These tests verify the correct HTTP endpoint is called per API family.
  // They use mock module replacement for createAsset/linkAsset to avoid
  // real filesystem + FK-constrained DB writes.

  describe("API family routing", () => {
    const baseSdConfig = {
      name: "test-provider",
      label: "Test",
      baseUrl: "http://localhost:7860",
      apiKey: undefined,
      purpose: "generate" as const,
      timeout: 5000,
      generationTimeout: 30_000,
      defaults: {
        width: 512,
        height: 512,
        steps: 20,
        cfgScale: 7,
        sampler: "euler",
      },
    };

    /** Stub AvatarService.prototype.createAvatar + disable FK to skip DB writes */
    let origCreateAvatar: (...args: any[]) => any;
    function stubDbWrites() {
      // eslint-disable-next-line @typescript-eslint/unbound-method
      origCreateAvatar = AvatarService.prototype.createAvatar;
      AvatarService.prototype.createAvatar = mock(async () => randomUUID());
      sqlite.run("PRAGMA foreign_keys = OFF",);
    }
    function restoreDbWrites() {
      AvatarService.prototype.createAvatar = origCreateAvatar;
      sqlite.run("PRAGMA foreign_keys = ON",);
    }

    afterEach(() => {
      restoreDbWrites();
    },);

    it("calls openai-compatible endpoint for openai family", async () => {
      stubDbWrites();
      const capturedUrls: string[] = [];
      const pngBuf = makeMinimalPng(512, 512,);

      mockFetch(async (url, _init,) => {
        capturedUrls.push(url,);
        return Response.json({
          data: [{ b64_json: pngBuf.toString("base64",), },],
        },);
      },);

      const genFn = (emotionService as any).generateEmotionAvatar.bind(emotionService,);
      const result = await genFn({
        actorId: testActorId,
        emotion: EmotionType.Happy,
        sdConfig: { ...baseSdConfig, apiFamily: "openai", },
        uploadDir: "/tmp/test-uploads",
      },);

      expect(capturedUrls.some((u,) => u.includes("/v1/images/generations",)),).toBe(true,);
      expect(result.avatarId,).toBeDefined();
      expect(result.assetId,).toBeDefined();
    });

    it("calls sdapi endpoint for sdapi family", async () => {
      stubDbWrites();
      const capturedUrls: string[] = [];
      const pngBuf = makeMinimalPng(512, 512,);

      mockFetch(async (url, _init,) => {
        capturedUrls.push(url,);
        return Response.json({
          images: [pngBuf.toString("base64",),],
        },);
      },);

      const genFn = (emotionService as any).generateEmotionAvatar.bind(emotionService,);
      const result = await genFn({
        actorId: testActorId,
        emotion: EmotionType.Sad,
        sdConfig: { ...baseSdConfig, apiFamily: "sdapi", },
        uploadDir: "/tmp/test-uploads",
      },);

      expect(capturedUrls.some((u,) => u.includes("/sdapi/v1/txt2img",)),).toBe(true,);
      expect(result.avatarId,).toBeDefined();
    });

    it("calls sdcpp endpoint for sdcpp family", async () => {
      stubDbWrites();
      const capturedUrls: string[] = [];
      const pngBuf = makeMinimalPng(512, 512,);

      mockFetch(async (url, _init,) => {
        capturedUrls.push(url,);
        // First call: submit job, subsequent: poll status
        if (capturedUrls.length <= 1) {
          return Response.json({ id: "job-123", },);
        }
        return Response.json({
          status: "done",
          images: [pngBuf.toString("base64",),],
        },);
      },);

      const genFn = (emotionService as any).generateEmotionAvatar.bind(emotionService,);
      const result = await genFn({
        actorId: testActorId,
        emotion: EmotionType.Angry,
        sdConfig: { ...baseSdConfig, apiFamily: "sdcpp", },
        uploadDir: "/tmp/test-uploads",
      },);

      expect(capturedUrls.some((u,) => u.includes("/sdcpp/v1/img_gen",)),).toBe(true,);
      expect(capturedUrls.some((u,) => u.includes("/sdcpp/v1/jobs/",)),).toBe(true,);
      expect(result.avatarId,).toBeDefined();
    });

    it("throws on unsupported API family", async () => {
      stubDbWrites();
      mockFetch(async () => Response.json({},));

      const genFn = (emotionService as any).generateEmotionAvatar.bind(emotionService,);
      await expect(genFn({
        actorId: testActorId,
        emotion: EmotionType.Neutral,
        sdConfig: { ...baseSdConfig, apiFamily: "unsupported" as any, },
        uploadDir: "/tmp/test-uploads",
      },),).rejects.toThrow("not supported",);
    });
  });

  // ── Emotion tags ───────────────────────────────────────────────

  describe("emotion prompt modifiers", () => {
    it("returns correct modifier for each emotion", () => {
      expect(emotionService.getEmotionPromptModifier(EmotionType.Happy,),).toContain("happy",);
      expect(emotionService.getEmotionPromptModifier(EmotionType.Sad,),).toContain("sad",);
      expect(emotionService.getEmotionPromptModifier(EmotionType.Angry,),).toContain("angry",);
      expect(emotionService.getEmotionPromptModifier(EmotionType.Neutral,),).toContain("neutral",);
      expect(emotionService.getEmotionPromptModifier(EmotionType.Excited,),).toContain("excited",);
    });

    it("returns fallback for unknown emotion", () => {
      const result = emotionService.getEmotionPromptModifier("unknown" as EmotionType,);
      expect(result,).toBe("neutral expression",);
    });

    it("prefers the config-driven emotion intent over the built-in modifier", () => {
      const configEmotions = {
        happy: { asset: "happy.png", intent: "radiant warm smile", },
        sad: { asset: "sad.png", intent: "gentle sad expression", },
      };
      const result = emotionService.resolveEmotionPromptModifier(EmotionType.Happy, configEmotions,);
      expect(result,).toBe("radiant warm smile",);
    });

    it("falls back to the built-in modifier when the emotion is absent from the config map", () => {
      const result = emotionService.resolveEmotionPromptModifier(EmotionType.Happy, {},);
      expect(result,).toBe(emotionService.getEmotionPromptModifier(EmotionType.Happy,),);
    });
  });

  // ── Batch job lifecycle ────────────────────────────────────────

  describe("batch job lifecycle", () => {
    it("rejects non-existent base avatar", async () => {
      await expect(emotionService.startBatchGeneration({
        actorId: testActorId,
        baseAvatarId: "non-existent-avatar",
      },),).rejects.toThrow("not found",);
    });

    it("returns undefined for non-existent job status", () => {
      const status = emotionService.getJobStatus("non-existent" as any,);
      expect(status,).toBeUndefined();
    });

    it("returns false when cancelling non-existent job", () => {
      const result = emotionService.cancelJob("non-existent" as any,);
      expect(result,).toBe(false,);
    });

    it("lists jobs for an actor", () => {
      const jobs = emotionService.listJobs(testActorId,);
      expect(Array.isArray(jobs,),).toBe(true,);
    });
  });

  // ── Metadata propagation through asset pipeline ────────────────

  describe("asset metadata propagation", () => {
    it("stores width and height from image buffer", () => {
      const buf = makeMinimalPng(1024, 768,);
      const meta = extractImageMetadata(new Uint8Array(buf,),);
      expect(meta.width,).toBe(1024,);
      expect(meta.height,).toBe(768,);
      expect(meta.format,).toBe("png",);
    });

    it("extracts embedded caption for alt_text", () => {
      const buf = makeMinimalPngWithCaption("Character portrait", 512, 512,);
      const meta = extractImageMetadata(new Uint8Array(buf,),);
      expect(meta.caption,).toBe("Character portrait",);
    });

    it("handles JPEG images from ComfyUI/SD.CPP", () => {
      const buf = makeMinimalJpeg(512, 512,);
      const meta = extractImageMetadata(new Uint8Array(buf,),);
      expect(meta.format,).toBe("jpeg",);
      expect(meta.width,).toBe(512,);
      expect(meta.height,).toBe(512,);
    });

    it("handles WebP images from providers", () => {
      const buf = makeMinimalWebp(768, 512,);
      const meta = extractImageMetadata(new Uint8Array(buf,),);
      expect(meta.format,).toBe("webp",);
      expect(meta.width,).toBe(768,);
      expect(meta.height,).toBe(512,);
    });
  });
});
