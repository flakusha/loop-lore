// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterAll, afterEach, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../config/schema";
import { createConfigSchema, } from "../config/schema-class";
import type { DB, } from "../db/schema";
import { createTestDb, destroyTestDb, type TestDb, } from "../test-utils/create-test-db";
import { insertUsers, } from "../test-utils/insert-helpers";
import { comfyUIModelRoutes, } from "./comfyui-models";

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
});
