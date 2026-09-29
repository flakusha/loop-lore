// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for image-gen-route.ts — LoRA opt-in / unsupported-backend behavior.
 *
 * Scope: input validation, LoRA passthrough, unsupported-backend guard.
 * generateImages is mocked so no real image generation occurs.
 */
import { beforeEach, expect, it, mock, } from "bun:test";
import { randomUUID, } from "node:crypto";
import { describeOrSkip, ISOLATED, } from "../test-utils/isolate-only";
// Capture real modules before mocking so each mock re-exposes the module's
// other exports and overrides only the specific function under test. Bun's
// mock.module leaks across files without --isolate; mocking a whole module
// clobbers every other export it provides (e.g. safeJsonParse in ../utils),
// breaking unrelated tests that import the same barrel/module.
import * as realAssetCreate from "../assets/service/create";
import * as realAssetLinks from "../assets/service/links";
import * as realConfigLoad from "../config/load";
import { createConfigSchema, } from "../config/schema-class";
// (no realDb import: ../db/index is intentionally unstubbed; see NOTE above)
import type { Kysely, } from "kysely";
import type { TemplateModality, } from "../db/enums";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertChats, } from "../test-utils/insert-helpers";
import * as realUtils from "../utils";
import * as realImageEngine from "./image-engine";
import type * as imageGenRoute from "./image-gen-route";

// ── Mutable call-history containers (mutated in beforeEach, read in tests) ──────

const generateImagesCalls: Array<[unknown, Record<string, unknown>,]> = [];
const linkAssetCalls: Array<{ entityType: string; entityId: string; label: string }> = [];
/** When set, mockGenerateImages fails with this outcome (provider-error path). */
let generateError: { ok: false; error: string; status: number } | null = null;

// ── Mock implementations ───────────────────────────────────────────────────────

/**
 * @param _sdConfig
 * @param opts
 */
async function mockGenerateImages(
  _sdConfig: unknown,
  opts: Record<string, unknown>,
) {
  generateImagesCalls.push([_sdConfig, opts,],);
  if (generateError) { return generateError; }
  return {
    ok: true,
    images: [Buffer.from("fake-image-bytes",),],
    mimeType: "image/png",
  };
}

/** */
function mockUid() {
  return randomUUID();
}

const mockAsset = {
  id: "asset-1",
  filename: "generated-abc12345.png",
  mime_type: "image/png",
};

/**
 * @param _opts
 */
async function mockCreateAsset(_opts: unknown,) {
  return { asset: mockAsset, };
}

/**
 * @param _opts
 */
async function mockLinkAsset(opts: { link: { entityType: string; entityId: string; label: string } },) {
  linkAssetCalls.push(opts.link,);
}

// NOTE: no getDatabase stub on purpose. The SUT only threads the handle to
// the (mocked) createAsset, and a process-global stub breaks later files'
// setTestDatabase visibility (caption-route, e2e). The real file database is
// never touched because createAsset/linkAsset are mocked.

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
//
// Bun's mock.module is process-global for a whole `bun test` invocation and
// cannot be unmocked: without isolation these stubs leak into every later
// test file (the fixed extractImageMetadata made emotion-avatar metadata
// tests see PNG/512x512 for every buffer; a partial loadConfig dropped
// required config sections like byoKey downstream). The repo convention for
// such files is `describeOrSkip` + an ISOLATED guard: plain `bun test src/`
// skips registration entirely, and the canonical gate (`bun run check` /
// `test:unit`) runs with `--isolate`, where each file gets its own module
// registry and the mocks cannot leak.
let handleImageGeneration: typeof imageGenRoute.handleImageGeneration;

if (ISOLATED) {
  mock.module("../config/load", () => ({
    ...realConfigLoad,
    // Merge test overrides over full schema defaults: a bare defaultConfig
    // drops required sections (server, db, auth, byoKey, dynamicResponse)
    // for every later file in the process (e2e server boot, handler
    // policy wiring). Test behavior unchanged — assets/generation still
    // come from defaultConfig.
    loadConfig: () => ({ ...structuredClone(createConfigSchema().defaults,), ...defaultConfig, }),
  }),);

  mock.module("./image-engine", () => ({
    ...realImageEngine,
    generateImages: mockGenerateImages,
  }),);

  mock.module("../utils", () => ({
    ...realUtils,
    uid: mockUid,
  }),);

  // Narrow mocks to the specific submodules the SUT imports. Mocking the
  // whole `../assets/service` barrel would clobber
  // detectAssetType/unlinkAsset/getAsset/etc.
  mock.module("../assets/service/create", () => ({
    ...realAssetCreate,
    createAsset: mockCreateAsset,
  }),);
  mock.module("../assets/service/links", () => ({
    ...realAssetLinks,
    linkAsset: mockLinkAsset,
  }),);

  // No ../db/index stub (see NOTE above).

  // Dynamic import is required: mock.module must be registered BEFORE the
  // SUT module is evaluated, which a static import cannot guarantee.
  ({ handleImageGeneration, } = await import("./image-gen-route"));
}
// ── Helpers ─────────────────────────────────────────────────────────────────────

/**
 * @param overrides
 */
function makeBody(overrides?: Record<string, unknown>,) {
  return {
    prompt: "a beautiful portrait",
    n: 1,
    output_format: "png",
    ...overrides,
  };
}

/**
 * Seed a user (prompt_templates.owner_id FK parent) and a template row.
 * @param db
 * @param id
 * @param modality
 * @param name
 * @param payload
 */
async function seedTemplate(
  db: Kysely<DB>,
  id: string,
  modality: TemplateModality,
  name: string,
  payload: string,
): Promise<void> {
  await db.insertInto("users",).values({
    id: "test-user",
    username: "test-user",
    display_name: "Test User",
    role: "solo",
    status: "active",
    settings: "{}",
  },).execute();
  await db.insertInto("prompt_templates",).values({
    id,
    owner_id: "test-user",
    modality,
    name,
    payload,
  },).execute();
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
describeOrSkip("handleImageGeneration — LoRA opt-in / opt-out", () => {
  beforeEach(() => {
    generateImagesCalls.length = 0;
    linkAssetCalls.length = 0;
    generateError = null;
  },);

  // (1) Opt-out: no lora field → generateImages called WITHOUT lora

  it("does NOT pass lora to generateImages when lora field is absent", async () => {
    const body = makeBody({ prompt: "no lora prompt", },);
    await handleImageGeneration(body, undefined, "test-user",);

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
    await handleImageGeneration(body, undefined, "test-user",);

    expect(generateImagesCalls.length,).toBeGreaterThan(0,);
    const [, opts,] = generateImagesCalls[0]!;
    expect(opts.lora,).toEqual(LORA_CONFIG,);
  });

  // (3) Opt-in: ComfyUI backend selected + lora → passed through

  it("passes lora config to generateImages when ComfyUI backend is selected", async () => {
    mock.module("../config/load", () => ({
      ...realConfigLoad,
      // Full schema defaults underneath: this stub is process-global and
      // persists for every later file (e2e runs last); a bare
      // defaultConfig drops required sections (server, auth, ...) there.
      loadConfig: () => ({
        ...structuredClone(createConfigSchema().defaults,),
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
    await handleComfyUI(body, undefined, "test-user",);

    expect(generateImagesCalls.length,).toBeGreaterThan(0,);
    const [, opts,] = generateImagesCalls[0]!;
    expect((opts.lora as Record<string, unknown>).name,).toBe("style_lora",);
  });

  // (4) Missing prompt → HTTP 400

  it("returns HTTP 400 when prompt is missing", async () => {
    const body = makeBody({ prompt: undefined, },);
    const res = await handleImageGeneration(body, undefined, "test-user",);

    expect(res.status,).toBe(400,);
    const json = await res.json() as { error: string };
    expect(json.error,).toContain("prompt",);
  });

  // (5) No sd provider → HTTP 501

  it("returns HTTP 501 when no image generation provider is configured", async () => {
    mock.module("../config/load", () => ({
      ...realConfigLoad,
      // Full schema defaults underneath: this stub is process-global and
      // persists for every later file (e2e runs last); a bare
      // defaultConfig drops required sections (server, auth, ...) there.
      loadConfig: () => ({
        ...structuredClone(createConfigSchema().defaults,),
        ...defaultConfig,
        generation: { providers: { sd: [], }, },
      }),
    }),);

    const { handleImageGeneration: handleNoProvider, } = await import("./image-gen-route");
    const body = makeBody({ prompt: "any prompt", },);
    const res = await handleNoProvider(body, undefined, "test-user",);

    expect(res.status,).toBe(501,);
  });

  // (6) openai backend + lora → HTTP 400 (non-fallible guard)

  it("returns HTTP 400 when LoRA is requested with an unsupported backend (openai)", async () => {
    mock.module("../config/load", () => ({
      ...realConfigLoad,
      // Full schema defaults underneath: this stub is process-global and
      // persists for every later file (e2e runs last); a bare
      // defaultConfig drops required sections (server, auth, ...) there.
      loadConfig: () => ({
        ...structuredClone(createConfigSchema().defaults,),
        ...defaultConfig,
        generation: {
          ...structuredClone(createConfigSchema().defaults,).generation,
          providers: {
            ...structuredClone(createConfigSchema().defaults,).generation.providers,
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
    const res = await handleOpenAI(body, undefined, "test-user",);

    expect(res.status,).toBe(400,);
    const json = await res.json() as { error: string };
    expect(json.error,).toContain("LoRA is not supported",);
    expect(json.error,).toContain("openai",);
  });

  // (7) openai backend, no lora → HTTP 200 (normal path still works)

  it("returns HTTP 200 when no lora is requested, regardless of backend", async () => {
    mock.module("../config/load", () => ({
      ...realConfigLoad,
      // Full schema defaults underneath: this stub is process-global and
      // persists for every later file (e2e runs last); a bare
      // defaultConfig drops required sections (server, auth, ...) there.
      loadConfig: () => ({
        ...structuredClone(createConfigSchema().defaults,),
        ...defaultConfig,
        generation: {
          ...structuredClone(createConfigSchema().defaults,).generation,
          providers: {
            ...structuredClone(createConfigSchema().defaults,).generation.providers,
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
    const res = await handleOpenAINoLora(body, undefined, "test-user",);

    expect(res.status,).toBe(200,);
  });

  // (8) Authentication: missing userId → HTTP 401

  it("returns HTTP 401 when userId is missing", async () => {
    const res = await handleImageGeneration(makeBody(), undefined, undefined,);

    expect(res.status,).toBe(401,);
    const json = await res.json() as { error: string };
    expect(json.error,).toContain("Authentication",);
  });

  // (9) Authorization: unknown chat → HTTP 403 (IDOR write guard)

  it("returns HTTP 403 when the chat does not exist for this user", async () => {
    const { db, } = await createTestDb();
    try {
      const res = await handleImageGeneration(
        makeBody({ prompt: "any prompt", chatId: "no-such-chat", },),
        db,
        "test-user",
      );

      expect(res.status,).toBe(403,);
    } finally {
      await db.destroy();
    }
  });

  // (10) Template path: unknown template → HTTP 404

  it("returns HTTP 404 when the prompt template is not found", async () => {
    const { db, } = await createTestDb();
    try {
      const res = await handleImageGeneration(
        makeBody({ prompt: "any prompt", templateId: "tpl-missing", },),
        db,
        "test-user",
      );

      expect(res.status,).toBe(404,);
      const json = await res.json() as { error: string };
      expect(json.error,).toContain("Template not found",);
    } finally {
      await db.destroy();
    }
  });

  // (11) Template path: non-image modality → HTTP 400

  it("returns HTTP 400 when the template is not an image template", async () => {
    const { db, } = await createTestDb();
    try {
      await seedTemplate(db, "tpl-llm", "llm", "LLM template", JSON.stringify({ body: "x", },),);
      const res = await handleImageGeneration(
        makeBody({ prompt: "any prompt", templateId: "tpl-llm", },),
        db,
        "test-user",
      );

      expect(res.status,).toBe(400,);
      const json = await res.json() as { error: string };
      expect(json.error,).toContain("not an image template",);
    } finally {
      await db.destroy();
    }
  });

  // (12) Template path: renders {{variables}} and negativePrompt

  it("renders the image template payload into the generation prompt", async () => {
    const { db, } = await createTestDb();
    try {
      await seedTemplate(
        db,
        "tpl-image",
        "image",
        "Image template",
        JSON.stringify({ templateBody: "a {{mood}} portrait", negativePrompt: "blurry", },),
      );
      const res = await handleImageGeneration(
        makeBody({ templateId: "tpl-image", context: { mood: "dark", }, },),
        db,
        "test-user",
      );

      expect(res.status,).toBe(200,);
      const [, opts,] = generateImagesCalls[generateImagesCalls.length - 1]!;
      expect(opts.prompt,).toBe("a dark portrait",);
      expect(opts.negativePrompt,).toBe("blurry",);
    } finally {
      await db.destroy();
    }
  });

  // (13) Provider failure → error status propagated

  it("propagates the provider error status when generation fails", async () => {
    generateError = { ok: false, error: "provider exploded", status: 502, };
    try {
      const res = await handleImageGeneration(makeBody(), undefined, "test-user",);

      expect(res.status,).toBe(502,);
      const json = await res.json() as { error: string };
      expect(json.error,).toBe("provider exploded",);
    } finally {
      generateError = null;
    }
  });

  // (14) Asset linking: messageId + chatId links recorded

  it("links the generated asset to the message and chat when both are provided", async () => {
    const { db, } = await createTestDb();
    try {
      await db.insertInto("users",).values({
        id: "test-user",
        username: "test-user",
        display_name: "Test User",
        role: "solo",
        status: "active",
        settings: "{}",
      },).execute();
      await insertChats(db, "Linked chat", "test-user", { id: "chat-1", } as never,);
      const res = await handleImageGeneration(
        makeBody({ prompt: "linked", messageId: "msg-1", chatId: "chat-1", },),
        db,
        "test-user",
      );

      expect(res.status,).toBe(200,);
      expect(linkAssetCalls,).toContainEqual({ entityType: "message", entityId: "msg-1", label: "generated", },);
      expect(linkAssetCalls,).toContainEqual({ entityType: "chat", entityId: "chat-1", label: "generated", },);
    } finally {
      await db.destroy();
    }
  });
},);
