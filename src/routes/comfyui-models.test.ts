// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterAll, afterEach, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { setConfig, } from "../admin/config";
import type { Config, } from "../config/schema";
import { createConfigSchema, } from "../config/schema-class";
import type { DB, } from "../db/schema";
import { createTestDb, destroyTestDb, type TestDb, } from "../test-utils/create-test-db";
import { insertUsers, } from "../test-utils/insert-helpers";
import {
  comfyUIModelConfigKey,
  comfyUIModelRoutes,
  resolveStoredComfyUIModelPins,
} from "./comfyui-models";

const USER_ID = "model-settings-user";
const originalFetch = globalThis.fetch;

/** @param db */
function makeConfig(): Config {
  const config = createConfigSchema().defaults as Config;
  config.generation.providers.video = [{
    name: "h3-local",
    baseUrl: "http://127.0.0.1:8188",
    apiFamily: "comfyui",
    workflow: "minimax-h3",
    timeout: 30_000,
    generationTimeout: 600_000,
    models: { diffusion: "pinned.safetensors", },
  },];

  return config;
}

/**
 * @param db
 * @param userId
 */
function makeApp(db: Kysely<DB>, userId: string | null,) {
  return new Elysia({ name: "test-comfyui-models", },)
    .derive(() => ({ userId, userRole: "user", }))
    .use(comfyUIModelRoutes({ database: db, config: makeConfig(), },),);
}

describe("GET /api/v1/comfyui/models", () => {
  let fixture: TestDb;

  beforeAll(async () => {
    fixture = await createTestDb();
    await insertUsers(fixture.db, USER_ID, "Model User", {
      id: USER_ID,
      settings: JSON.stringify({
        comfyUiModels: { "h3-local": { clip: "user-clip.safetensors", }, },
      },) as never,
    },);
  },);

  afterAll(async () => {
    await destroyTestDb(fixture,);
  },);

  afterEach(() => {
    globalThis.fetch = originalFetch;
  },);

  test("requires authentication", async () => {
    const res = await makeApp(fixture.db, null,).handle(
      new Request("http://localhost/api/v1/comfyui/models",),
    );

    expect(res.status,).toBe(401,);
  });

  test("merges discovery, config and user pins", async () => {
    (globalThis as Record<string, unknown>).fetch = async (input: string | URL | Request,) => {
      const path = new URL(String(input,),).pathname;
      if (path === "/models") {
        return Response.json(["clip", "diffusion_models", "vae",],);
      }

      if (path === "/models/clip") {
        return Response.json(["user-clip.safetensors", "other.safetensors",],);
      }

      if (path === "/models/diffusion_models") {
        return Response.json(["discovered.safetensors",],);
      }

      return Response.json(["vae-a.safetensors",],);
    };

    const res = await makeApp(fixture.db, USER_ID,).handle(
      new Request("http://localhost/api/v1/comfyui/models",),
    );

    expect(res.status,).toBe(200,);
    const body = await res.json() as {
      provider: string;
      clipRole: { selected: string | null; source: string };
      diffusionRole: { selected: string | null; source: string };
      vaeRole: { selected: string | null; source: string };
    };

    expect(body.provider,).toBe("h3-local",);
    expect(body.clipRole,).toMatchObject({ selected: "user-clip.safetensors", source: "user", },);
    expect(body.diffusionRole,).toMatchObject({ selected: "pinned.safetensors", source: "config", },);
    expect(body.vaeRole,).toMatchObject({ selected: "vae-a.safetensors", source: "discovery", },);
  });

  test("exposes image-provider checkpoint, clip_vision and loras roles", async () => {
    const config = makeConfig();
    config.generation.providers.sd = [{
      name: "img-local",
      label: "Image Local",
      baseUrl: "http://127.0.0.1:8189",
      apiFamily: "comfyui",
      defaults: { width: 512, height: 512, steps: 20, cfgScale: 7, sampler: "euler", },
      timeout: 30_000,
      generationTimeout: 600_000,
      models: { checkpoint: "base.ckpt", },
    },];

    (globalThis as Record<string, unknown>).fetch = async (input: string | URL | Request,) => {
      const path = new URL(String(input,),).pathname;
      if (path === "/object_info") { return Response.json({},); }
      if (path === "/models") { return Response.json(["checkpoints", "clip_vision", "loras",],); }
      if (path === "/models/clip_vision") { return Response.json(["vision-a.safetensors",],); }
      if (path === "/models/loras") { return Response.json(["style-a.safetensors",],); }
      return Response.json(["base.ckpt",],);
    };

    const app = new Elysia({ name: "test-comfyui-image-models", },)
      .derive(() => ({ userId: USER_ID, userRole: "user", }))
      .use(comfyUIModelRoutes({ database: fixture.db, config, },),);

    const res = await app.handle(
      new Request("http://localhost/api/v1/comfyui/models?kind=image&provider=img-local",),
    );

    expect(res.status,).toBe(200,);
    const body = await res.json() as {
      clip_vision: string[];
      lorasRole: { selected: string | null; source: string };
      checkpointRole: { selected: string | null; source: string };
    };

    expect(body.clip_vision,).toEqual(["vision-a.safetensors",],);
    expect(body.lorasRole,).toMatchObject({ selected: "style-a.safetensors", source: "discovery", },);
    expect(body.checkpointRole,).toMatchObject({ selected: "base.ckpt", source: "config", },);
  });

  test("returns the empty view when no provider is configured (not 404)", async () => {
    const config = makeConfig();
    config.generation.providers.video = [];

    const app = new Elysia({ name: "test-comfyui-models-empty", },)
      .derive(() => ({ userId: USER_ID, userRole: "user", }))
      .use(comfyUIModelRoutes({ database: fixture.db, config, },),);

    const res = await app.handle(
      new Request("http://localhost/api/v1/comfyui/models",),
    );

    expect(res.status,).toBe(200,);
    const body = await res.json() as {
      provider: null;
      clipRole: { candidates: string[]; selected: null; source: string };
    };

    expect(body.provider,).toBeNull();
    expect(body.clipRole,).toMatchObject({ candidates: [], selected: null, source: "none", },);
  });

  test("resolves persisted user and admin pins for generation paths", async () => {
    await setConfig(
      fixture.db,
      comfyUIModelConfigKey("h3-local",),
      JSON.stringify({ clip: "admin-clip.safetensors", diffusion: "admin.safetensors", },),
      "test pin",
    );

    try {
      const pins = await resolveStoredComfyUIModelPins(
        fixture.db,
        USER_ID,
        ["h3-local", "other-provider",],
      );

      expect(pins["h3-local"],).toMatchObject({
        clip: "user-clip.safetensors",
        diffusion: "admin.safetensors",
      },);

      expect(pins["other-provider"],).toBeUndefined();
    } finally {
      await fixture.db.deleteFrom("system_config",)
        .where("key", "=", comfyUIModelConfigKey("h3-local",),)
        .execute();
    }
  });
});

describe("comfyUIModelConfigKey", () => {
  test("namespaces the key by provider", () => {
    expect(comfyUIModelConfigKey("h3-local",),).toBe("comfyui.models.h3-local",);
  });
});
