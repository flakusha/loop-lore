// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for image-gen-route.ts — LoRA opt-in / unsupported-backend behavior.
 *
 * Scope: input validation, LoRA passthrough, unsupported-backend guard.
 * generateImages is mocked so no real image generation occurs.
 */

import { beforeEach, describe, expect, it, mock, } from "bun:test";
import { randomUUID, } from "node:crypto";
// Capture real modules before mocking so each mock re-exposes the module's
// other exports and overrides only the specific function under test. Bun's
// mock.module leaks across files without --isolate; mocking a whole module
// clobbers every other export it provides (e.g. safeJsonParse in ../utils),
// breaking unrelated tests that import the same barrel/module.
import * as realAssetMetadata from "../assets/metadata";
import * as realAssetLinks from "../assets/service/links";
import * as realConfigLoad from "../config/load";
import * as realDb from "../db/index";
import * as realUtils from "../utils";
import * as realImageEngine from "./image-engine";

// ── Mutable call-history containers (mutated in beforeEach, read in tests) ──────

const generateImagesCalls: Array<[unknown, Record<string, unknown>,]> = [];

// ── Mock implementations ───────────────────────────────────────────────────────

async function mockGenerateImages(
  _sdConfig: unknown,
  opts: Record<string, unknown>,
) {
  generateImagesCalls.push([_sdConfig, opts,],);
  return {
    ok: true,
    images: [Buffer.from("fake-image-bytes",),],
    mimeType: "image/png",
  };
}

function mockExtractImageMetadata(_buf: Buffer,) {
  return { width: 512, height: 512, format: "png", };
}

function mockUid() {
  return randomUUID();
}

const mockAsset = {
  id: "asset-1",
  filename: "generated-abc12345.png",
  mime_type: "image/png",
};

async function mockCreateAsset(_opts: unknown,) {
  return { asset: mockAsset, };
}

async function mockLinkAsset(_opts: unknown,) {}

function mockGetDatabase() {
  return {} as ReturnType<typeof import("../db/index").getDatabase>;
}

// ── Default config (sdcpp provider selected) ───────────────────────────────────

const defaultConfig = {
  assets: { uploadDir: "/tmp", },
  generation: {
    providers: {
      sd: [
        {
          name: "test-sdcpp",
          label: "Test sd.cpp",
          baseUrl: "http://127.0.0.1:7860",
          apiFamily: "sdcpp",
          purpose: "generate",
          defaults: {
            width: 512,
            height: 512,
            steps: 20,
            cfgScale: 7,
            negativePrompt: "",
            sampler: "Euler",
          },
          timeout: 30_000,
          generationTimeout: 300_000,
        },
      ],
    },
  },
};

// ── Register mocks BEFORE importing module-under-test ────────────────────────────

mock.module("../config/load", () => ({
  ...realConfigLoad,
  loadConfig: () => defaultConfig,
}),);

mock.module("./image-engine", () => ({
  ...realImageEngine,
  generateImages: mockGenerateImages,
}),);

mock.module("../assets/metadata", () => ({
  ...realAssetMetadata,
  extractImageMetadata: mockExtractImageMetadata,
}),);

mock.module("../utils", () => ({
  ...realUtils,
  uid: mockUid,
}),);

// Narrow mocks to the specific submodules the SUT imports. Mocking the whole
// `../assets/service` barrel leaks (without --isolate) and clobbers
// detectAssetType/unlinkAsset/getAsset/etc. for every later test file.
mock.module("../assets/service/create", () => ({
  createAsset: mockCreateAsset,
}),);
mock.module("../assets/service/links", () => ({
  ...realAssetLinks,
  linkAsset: mockLinkAsset,
}),);

mock.module("../db/index", () => ({
  ...realDb,
  getDatabase: mockGetDatabase,
}),);

// ── Import after mocks are in place ─────────────────────────────────────────────

const { handleImageGeneration, } = await import("./image-gen-route");

// ── Helpers ─────────────────────────────────────────────────────────────────────

function makeBody(overrides?: Record<string, unknown>,) {
  return {
    prompt: "a beautiful portrait",
    n: 1,
    output_format: "png",
    ...overrides,
  };
}

const LORA_CONFIG = {
  name: "my_character",
  strength: 0.7,
  backend: "sd-server" as const,
};

const COMFYUI_CONFIG = {
  name: "style_lora",
  strength: 0.5,
  backend: "comfyui" as const,
};

// ── Tests ───────────────────────────────────────────────────────────────────────

describe("handleImageGeneration — LoRA opt-in / opt-out", () => {
  beforeEach(() => {
    generateImagesCalls.length = 0;
  },);

  // (1) Opt-out: no lora field → generateImages called WITHOUT lora

  it("does NOT pass lora to generateImages when lora field is absent", async () => {
    const body = makeBody({ prompt: "no lora prompt", },);
    await handleImageGeneration(body,);

    expect(generateImagesCalls.length,).toBeGreaterThan(0,);
    const [, opts,] = generateImagesCalls[0]!;
    expect(opts.lora,).toBeUndefined();
  });

  // (2) Opt-in: sd.cpp + lora → generateImages called WITH lora

  it("passes lora config to generateImages when sd.cpp backend is selected", async () => {
    const body = makeBody({
      prompt: "lora prompt",
      lora: LORA_CONFIG,
    },);
    await handleImageGeneration(body,);

    expect(generateImagesCalls.length,).toBeGreaterThan(0,);
    const [, opts,] = generateImagesCalls[0]!;
    expect(opts.lora,).toEqual(LORA_CONFIG,);
  });

  // (3) Opt-in: ComfyUI backend selected + lora → passed through

  it("passes lora config to generateImages when ComfyUI backend is selected", async () => {
    mock.module("../config/load", () => ({ ...realConfigLoad,
      loadConfig: () => ({
        ...defaultConfig,
        generation: {
          providers: {
            sd: [
              {
                name: "test-comfyui",
                label: "Test ComfyUI",
                baseUrl: "http://127.0.0.1:8188",
                apiFamily: "comfyui",
                purpose: "generate",
                defaults: {
                  width: 512,
                  height: 512,
                  steps: 20,
                  cfgScale: 7,
                  negativePrompt: "",
                  sampler: "Euler",
                },
                timeout: 30_000,
                generationTimeout: 120_000,
              },
            ],
          },
        },
      }),
    }),);

    const { handleImageGeneration: handleComfyUI, } = await import("./image-gen-route");

    const body = makeBody({
      prompt: "comfyui lora prompt",
      lora: COMFYUI_CONFIG,
    },);
    await handleComfyUI(body,);

    expect(generateImagesCalls.length,).toBeGreaterThan(0,);
    const [, opts,] = generateImagesCalls[0]!;
    expect((opts.lora as Record<string, unknown>).name,).toBe("style_lora",);
  });

  // (4) Missing prompt → HTTP 400

  it("returns HTTP 400 when prompt is missing", async () => {
    const body = makeBody({ prompt: undefined, },);
    const res = await handleImageGeneration(body,);

    expect(res.status,).toBe(400,);
    const json = await res.json() as { error: string };
    expect(json.error,).toContain("prompt",);
  });

  // (5) No sd provider → HTTP 501

  it("returns HTTP 501 when no image generation provider is configured", async () => {
    mock.module("../config/load", () => ({ ...realConfigLoad,
      loadConfig: () => ({
        ...defaultConfig,
        generation: { providers: { sd: [], }, },
      }),
    }),);

    const { handleImageGeneration: handleNoProvider, } = await import("./image-gen-route");
    const body = makeBody({ prompt: "any prompt", },);
    const res = await handleNoProvider(body,);

    expect(res.status,).toBe(501,);
  });

  // (6) openai backend + lora → HTTP 400 (non-fallible guard)

  it("returns HTTP 400 when LoRA is requested with an unsupported backend (openai)", async () => {
    mock.module("../config/load", () => ({ ...realConfigLoad,
      loadConfig: () => ({
        ...defaultConfig,
        generation: {
          providers: {
            sd: [
              {
                name: "test-openai",
                label: "Test OpenAI",
                baseUrl: "http://127.0.0.1:8080/v1",
                apiFamily: "openai",
                purpose: "generate",
                defaults: {
                  width: 512,
                  height: 512,
                  steps: 20,
                  cfgScale: 7,
                  negativePrompt: "",
                  sampler: "Euler",
                },
                timeout: 30_000,
                generationTimeout: 120_000,
              },
            ],
          },
        },
      }),
    }),);

    const { handleImageGeneration: handleOpenAI, } = await import("./image-gen-route");
    const body = makeBody({
      prompt: "lora with openai",
      lora: LORA_CONFIG,
    },);
    const res = await handleOpenAI(body,);

    expect(res.status,).toBe(400,);
    const json = await res.json() as { error: string };
    expect(json.error,).toContain("LoRA is not supported",);
    expect(json.error,).toContain("openai",);
  });

  // (7) openai backend, no lora → HTTP 200 (normal path still works)

  it("returns HTTP 200 when no lora is requested, regardless of backend", async () => {
    mock.module("../config/load", () => ({ ...realConfigLoad,
      loadConfig: () => ({
        ...defaultConfig,
        generation: {
          providers: {
            sd: [
              {
                name: "test-openai",
                label: "Test OpenAI",
                baseUrl: "http://127.0.0.1:8080/v1",
                apiFamily: "openai",
                purpose: "generate",
                defaults: {
                  width: 512,
                  height: 512,
                  steps: 20,
                  cfgScale: 7,
                  negativePrompt: "",
                  sampler: "Euler",
                },
                timeout: 30_000,
                generationTimeout: 120_000,
              },
            ],
          },
        },
      }),
    }),);

    const { handleImageGeneration: handleOpenAINoLora, } = await import("./image-gen-route");
    const body = makeBody({ prompt: "normal openai request", },);
    const res = await handleOpenAINoLora(body,);

    expect(res.status,).toBe(200,);
  });
});
