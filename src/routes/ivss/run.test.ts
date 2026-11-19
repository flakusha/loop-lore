// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import { randomUUID, } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile, } from "node:fs/promises";
import { tmpdir, } from "node:os";
import { join, } from "node:path";

import { verifyAssetUrl, } from "../../assets/signed-url";
import type { Config, } from "../../config/schema";
import { createConfigSchema, } from "../../config/schema-class";
import { AssetType, } from "../../db/enums";
import {
  FragmentOperation,
  FragmentStatus,
  SceneMode,
  SceneStatus,
} from "../../db/enums-generation";
import type { IvssComfyClient, } from "../../generation/ivss/run-pipeline";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import {
  insertAssets,
  insertScenarioFragments,
  insertScenarios,
  insertScenarioScenes,
  insertScenarioShots,
  insertUsers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { ivssRunRoutes, } from "./run";

const SECRET = "test-hmac-secret-0123456789";

/** Config with a ComfyUI provider and a signing secret. */
function makeConfig(): Config {
  const config = createConfigSchema().defaults as Config;
  config.generation.providers.video = [{
    name: "comfyui",
    baseUrl: "http://127.0.0.1:8188",
    apiFamily: "comfyui",
    workflow: "h3-local",
    timeout: 30_000,
    generationTimeout: 600_000,
  },];

  config.assets.signedUrlSecret = SECRET;
  return config;
}

/** Client that returns a clip and a latent without touching the network. */
function stubClient(): IvssComfyClient {
  return {
    async submitWorkflow() {
      return { prompt_id: "prompt-1", };
    },
    async waitForFiles() {
      return [
        { kind: "video", file: { filename: "clip.webm", }, },
        { kind: "other", file: { filename: "state.safetensors", }, },
      ];
    },
    async downloadFile() {
      return Buffer.from("bytes",);
    },
    async cancelExecution() {},
    async uploadImage() {
      return "comfy-input";
    },
  };
}

describe("IVSS fragment run route", () => {
  let fixture: TestDb;
  let uploadDir: string;
  let ownerId: string;
  let fragmentId: string;
  let parentFragmentId: string;
  let latentId: string;
  let foreignFragmentId: string;

  beforeEach(async () => {
    fixture = await createTestDb();
    uploadDir = await mkdtemp(join(tmpdir(), "ivss-run-route-",),);
    const db = fixture.db;

    ownerId = await insertUsers(db, `owner-${randomUUID()}`, "Owner",);
    const otherId = await insertUsers(db, `other-${randomUUID()}`, "Other",);
    const worldId = await insertWorlds(db, ownerId, "World",);
    const scenarioId = await insertScenarios(db, worldId, ownerId, "Scenario",);
    const sceneId = await insertScenarioScenes(db, scenarioId, {
      mode: SceneMode.Image,
      seed: "9007199254740995",
      status: SceneStatus.Planned,
    },);

    await insertScenarioShots(db, sceneId, 1500, "Dusk",);

    parentFragmentId = await insertScenarioFragments(
      db,
      sceneId,
      FragmentOperation.Render,
      "h3-local",
      "sha256:abc",
      { status: FragmentStatus.Completed, },
    );

    latentId = `latent-${randomUUID()}`;
    const storagePath = `latents/${latentId}.latent`;
    await mkdir(join(uploadDir, "latents",), { recursive: true, },);
    await writeFile(join(uploadDir, storagePath,), Buffer.from("latent",),);
    await insertAssets(
      db,
      ownerId,
      `${latentId}.latent`,
      "application/octet-stream",
      AssetType.Other,
      16,
      storagePath,
      { id: latentId, },
    );

    await db.updateTable("scenario_fragments",).set({ latent_asset_id: latentId, },)
      .where("id", "=", parentFragmentId,).execute();

    fragmentId = await insertScenarioFragments(
      db,
      sceneId,
      FragmentOperation.Render,
      "h3-local",
      "sha256:abc",
      { status: FragmentStatus.Planned, parent_fragment_id: parentFragmentId, take: "1", },
    );

    const otherWorldId = await insertWorlds(db, otherId, "Other World",);
    const otherScenarioId = await insertScenarios(db, otherWorldId, otherId, "Foreign",);
    const otherSceneId = await insertScenarioScenes(db, otherScenarioId, {
      mode: SceneMode.Image,
      fps: 24,
      duration_frames: 24,
    },);

    foreignFragmentId = await insertScenarioFragments(
      db,
      otherSceneId,
      FragmentOperation.Render,
      "wf",
      "sha256:other",
      { status: FragmentStatus.Planned, },
    );
  },);

  afterEach(async () => {
    await destroyTestDb(fixture,);
    await rm(uploadDir, { recursive: true, force: true, },);
  },);

  /**
   * @param userId - injected authenticated caller
   * @returns app plus the first workflow variable snapshot
   */
  function makeApp(userId: string | null,) {
    let capture: ((vars: Record<string, string | number | boolean>,) => void) | undefined;
    const varsSeen = new Promise<Record<string, string | number | boolean>>(
      (resolve,) => {
        capture = resolve;
      },
    );

    const app = new Elysia({ name: "test-ivss-run", },)
      .derive(() => ({ userId, userRole: "user", }))
      .use(ivssRunRoutes({
        database: fixture.db,
        config: makeConfig(),
        uploadDir,
        createClient: () => stubClient(),
        loadWorkflow: async (_name, vars,) => {
          capture?.(vars,);
          return { "1": { class_type: "Stub", inputs: {}, }, };
        },
        dispatch: async (runOpts,) => {
          await runOpts.run?.();
        },
      },),);

    return { app, varsSeen, };
  }

  /**
   * @param id - fragment id in the request path
   * @param body - optional run body
   * @returns POST request against the run route
   */
  function postRequest(id: string, body: Record<string, string>,): Request {
    return new Request(`http://localhost/api/v1/ivss/fragments/${id}/run`, {
      method: "POST",
      headers: { "content-type": "application/json", },
      body: JSON.stringify(body,),
    },);
  }

  test("signs a latent URL that verifyAssetUrl accepts", async () => {
    const { app, varsSeen, } = makeApp(ownerId,);
    const res = await app.handle(
      postRequest(fragmentId, { resumeFromFragmentId: parentFragmentId, },),
    );

    expect(res.status,).toBe(202,);

    const vars = await varsSeen;
    const parsed = new URL(String(vars.latent_url,),);
    expect(parsed.origin,).toBe("http://localhost",);
    expect(parsed.pathname,).toBe(`/api/assets/${latentId}/raw`,);
    const verified = await verifyAssetUrl({
      secret: SECRET,
      token: parsed.searchParams.get("sig",) ?? "",
      assetId: latentId,
      action: "raw",
      expiresAt: Number(parsed.searchParams.get("expires",),),
    },);

    expect(verified.valid,).toBe(true,);
    expect(String(vars.latent_path,),).toContain(`${latentId}.latent`,);
  });

  test("rejects a fragment owned by another user", async () => {
    const { app, } = makeApp(ownerId,);
    const res = await app.handle(postRequest(foreignFragmentId, {},),);
    expect(res.status,).toBe(403,);
  });

  test("does not leak the signed token outside the workflow input", async () => {
    const { app, varsSeen, } = makeApp(ownerId,);
    const res = await app.handle(
      postRequest(fragmentId, { resumeFromFragmentId: parentFragmentId, },),
    );

    expect(res.status,).toBe(202,);

    const vars = await varsSeen;
    const token = new URL(String(vars.latent_url,),).searchParams.get("sig",) ?? "";
    expect(token.length,).toBeGreaterThan(0,);
    const text = await res.text();
    expect(text,).not.toContain(token,);
    expect(text,).not.toContain("sig=",);
    expect(text,).not.toContain("latent_url",);
  });
});
