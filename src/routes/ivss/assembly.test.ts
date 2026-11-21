// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import { randomUUID, } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile, } from "node:fs/promises";
import { tmpdir, } from "node:os";
import { join, } from "node:path";

import type { Config, VideoProviderConfig, } from "../../config/schema";
import { createConfigSchema, } from "../../config/schema-class";
import { AssetType, } from "../../db/enums";
import { FragmentOperation, FragmentStatus, SceneMode, } from "../../db/enums-generation";
import type { IvssComfyClient, } from "../../generation/ivss/run-pipeline";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import {
  insertAssets,
  insertScenarioFragments,
  insertScenarios,
  insertScenarioScenes,
  insertUsers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { ivssAssemblyRoutes, } from "./assembly";

/** Config with the comfyui provider the route requires. */
function makeConfig(): Config {
  const config = createConfigSchema().defaults as Config;
  config.generation.providers.video = [{
    name: "comfyui",
    baseUrl: "http://127.0.0.1:8188",
    apiFamily: "comfyui",
    workflow: "stitch",
    timeout: 30_000,
    generationTimeout: 600_000,
  },];

  return config;
}

/** Client that parks at upload — before the default loader runs — so the assembly stays pending. */
function pendingClient(): IvssComfyClient {
  return {
    async submitWorkflow() {
      return { prompt_id: "never", };
    },
    async waitForFiles() {
      return [];
    },
    async downloadFile() {
      return Buffer.from("",);
    },
    async cancelExecution() {},
    async uploadImage() {
      return await new Promise<string>(() => {},);
    },
  };
}

describe("IVSS assembly routes", () => {
  let fixture: TestDb;
  let uploadDir: string;
  let ownerId: string;
  let ownedScenarioId: string;
  let foreignScenarioId: string;

  beforeEach(async () => {
    fixture = await createTestDb();
    uploadDir = await mkdtemp(join(tmpdir(), "ivss-assembly-route-",),);
    const db = fixture.db;

    ownerId = await insertUsers(db, `owner-${randomUUID()}`, "Owner",);
    const otherOwnerId = await insertUsers(db, `other-${randomUUID()}`, "Other",);
    const worldId = await insertWorlds(db, ownerId, "World",);
    const otherWorldId = await insertWorlds(db, otherOwnerId, "Other World",);
    ownedScenarioId = await insertScenarios(db, worldId, ownerId, "Owned",);
    foreignScenarioId = await insertScenarios(db, otherWorldId, otherOwnerId, "Foreign",);

    const sceneId = await insertScenarioScenes(db, ownedScenarioId, {
      mode: SceneMode.Image,
      fps: 24,
      duration_frames: 24,
    },);

    const assetId = `asset-${randomUUID()}`;
    const storagePath = `clips/${assetId}.webm`;
    await mkdir(join(uploadDir, "clips",), { recursive: true, },);
    await writeFile(join(uploadDir, storagePath,), Buffer.from("clip",),);
    await insertAssets(db, ownerId, "clip.webm", "video/webm", AssetType.Video, 4, storagePath, {
      id: assetId,
    },);

    await insertScenarioFragments(db, sceneId, FragmentOperation.Render, "wf", "sha256:seed", {
      status: FragmentStatus.Completed,
      output_asset_id: assetId,
    },);
  },);

  afterEach(async () => {
    await destroyTestDb(fixture,);
    await rm(uploadDir, { recursive: true, force: true, },);
  },);

  /**
   * @param userId - injected authenticated user
   * @param createClient - optional stub client factory
   */
  function makeApp(userId: string | null, createClient?: (video: VideoProviderConfig,) => IvssComfyClient,) {
    return new Elysia({ name: "test-ivss-assembly", },)
      .derive(() => ({ userId, userRole: "user", }))
      .use(ivssAssemblyRoutes({
        database: fixture.db,
        config: makeConfig(),
        uploadDir,
        ...(createClient ? { createClient, } : {}),
      },),);
  }

  /** @param scenarioId - scenario in the request path */
  function getRequest(scenarioId: string,): Request {
    return new Request(`http://localhost/api/v1/ivss/scenarios/${scenarioId}/assembly`,);
  }

  /**
   * @param scenarioId - scenario in the request path
   * @param body - assembly request body
   */
  function postRequest(scenarioId: string, body: Record<string, string>,): Request {
    return new Request(`http://localhost/api/v1/ivss/scenarios/${scenarioId}/assembly`, {
      method: "POST",
      headers: { "content-type": "application/json", },
      body: JSON.stringify(body,),
    },);
  }

  test("GET returns 404 when the scenario has no assembly", async () => {
    const res = await makeApp(ownerId,).handle(getRequest(ownedScenarioId,),);
    expect(res.status,).toBe(404,);
  });

  test("GET rejects a scenario owned by another user", async () => {
    const res = await makeApp(ownerId,).handle(getRequest(foreignScenarioId,),);
    expect(res.status,).toBe(403,);
  });

  test("POST returns 202 with a pending assembly", async () => {
    const res = await makeApp(ownerId, () => pendingClient(),).handle(
      postRequest(ownedScenarioId, {
        workflowId: "wf",
        workflowHash: "sha256:seed",
        workflowVersion: "v1",
      },),
    );

    expect(res.status,).toBe(202,);
    const body = await res.json() as { assemblyId: string; status: string };
    expect(body.status,).toBe("pending",);
    expect(body.assemblyId,).toBeString();

    const assembly = await fixture.db.selectFrom("scenario_assemblies",).selectAll()
      .where("id", "=", body.assemblyId,).executeTakeFirstOrThrow();

    expect(assembly.status,).toBe("pending",);
    expect(assembly.version,).toBe(1,);
    expect(assembly.workflow_id,).toBe("wf",);
    expect(assembly.workflow_hash,).toBe("sha256:seed",);
    expect(assembly.workflow_version,).toBe("v1",);
  });

  test("POST rejects a scenario owned by another user", async () => {
    const res = await makeApp(ownerId, () => pendingClient(),).handle(
      postRequest(foreignScenarioId, { workflowId: "wf", workflowHash: "sha256:seed", },),
    );

    expect(res.status,).toBe(403,);
  });

  test("GET history returns every assembly newest first", async () => {
    const app = makeApp(ownerId, () => pendingClient(),);
    const body = { workflowId: "wf", workflowHash: "sha256:seed", };
    await app.handle(postRequest(ownedScenarioId, body,),);
    await app.handle(postRequest(ownedScenarioId, body,),);

    const res = await app.handle(
      new Request(`http://localhost/api/v1/ivss/scenarios/${ownedScenarioId}/assemblies`,),
    );

    expect(res.status,).toBe(200,);
    const rows = await res.json() as { version: number; status: string }[];
    expect(rows.length,).toBe(2,);
    expect(rows.map((row,) => row.version),).toEqual([2, 1,],);
    expect(rows[0]?.status,).toBe("pending",);
  });

  test("POST passes the configured generationTimeout to the stitch wait", async () => {
    let resolveTimeout!: (value: number | undefined,) => void;
    const timeoutSeen = new Promise<number | undefined>((resolve,) => {
      resolveTimeout = resolve;
    },);

    const config = makeConfig();
    config.generation.providers.video![0]!.generationTimeout = 45_000;

    const client: IvssComfyClient = {
      async submitWorkflow() {
        return { prompt_id: "prompt-stitch", };
      },
      async waitForFiles(_promptId, timeoutMs,) {
        resolveTimeout(timeoutMs,);
        return [];
      },
      async downloadFile() {
        return Buffer.from("",);
      },
      async cancelExecution() {},
      async uploadImage() {
        return "clip";
      },
    };

    const app = new Elysia({ name: "test-ivss-assembly-timeout", },)
      .derive(() => ({ userId: ownerId, userRole: "user", }))
      .use(ivssAssemblyRoutes({
        database: fixture.db,
        config,
        uploadDir,
        createClient: () => client,
        loadWorkflow: async () => ({ "1": { class_type: "Stub", inputs: {}, }, }),
      },),);

    const res = await app.handle(postRequest(ownedScenarioId, {
      workflowId: "wf",
      workflowHash: "sha256:seed",
    },),);

    expect(res.status,).toBe(202,);
    expect(await timeoutSeen,).toBe(45_000,);
  });
});
