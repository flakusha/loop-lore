// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { randomUUID, } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile, } from "node:fs/promises";
import { tmpdir, } from "node:os";
import { join, } from "node:path";

import { AssetType, } from "../../db/enums";
import {
  FragmentOperation,
  FragmentStatus,
  SceneMode,
  SceneStatus,
} from "../../db/enums-generation";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import {
  insertAssets,
  insertScenarioFragments,
  insertScenarios,
  insertScenarioScenes,
  insertUsers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { assembleScenario, type AssemblyCutPoint, getAssembly, listAssemblies, } from "./assembly";
import type { IvssComfyClient, IvssWorkflowLoader, } from "./run-pipeline";

// Resource contract: each test owns a fresh in-memory DB, temp upload dir,
// stub ComfyUI client and random ids; no test reads another test's rows.

interface StubCalls {
  uploaded: string[];
  loaded: Array<{ name: string; vars: Record<string, string | number | boolean> }>;
  submitted: number;
}

/** @param calls - call recorder */
function makeLoader(calls: StubCalls,): IvssWorkflowLoader {
  return async (name, vars,) => {
    calls.loaded.push({ name, vars, },);
    return { "1": { class_type: "StubSaveVideo", inputs: {}, }, };
  };
}

/**
 * @param calls - call recorder
 * @param overrides - failure injections
 */
function makeClient(calls: StubCalls, overrides: Partial<IvssComfyClient> = {},): IvssComfyClient {
  const base: IvssComfyClient = {
    async submitWorkflow() {
      calls.submitted += 1;
      return { prompt_id: `prompt-${calls.submitted}`, };
    },
    async waitForFiles() {
      return [{ kind: "video", file: { filename: "stitched.webm", }, },];
    },
    async downloadFile() {
      return Buffer.from("stitched-bytes",);
    },
    async cancelExecution() {},
    async uploadImage(_buffer, filename,) {
      calls.uploaded.push(filename,);
      return `comfy-${filename}`;
    },
  };

  return { ...base, ...overrides, };
}

describe("IVSS workflow-driven assembly", () => {
  let fixture: TestDb;
  let uploadDir: string;

  beforeEach(async () => {
    fixture = await createTestDb();
    uploadDir = await mkdtemp(join(tmpdir(), "ivss-assembly-",),);
  },);

  afterEach(async () => {
    await destroyTestDb(fixture,);
    await rm(uploadDir, { recursive: true, force: true, },);
  },);

  /** Seed two scenes with completed clips; insert the later scene first. */
  async function seed() {
    const db = fixture.db;
    const ownerId = await insertUsers(db, `owner-${randomUUID()}`, "Owner",);
    const worldId = await insertWorlds(db, ownerId, "World",);
    const scenarioId = await insertScenarios(db, worldId, ownerId, "Scenario",);
    const scene1 = await insertScenarioScenes(db, scenarioId, {
      sort_order: 0,
      mode: SceneMode.Image,
      fps: 24,
      duration_frames: 48,
      status: SceneStatus.Ready,
    },);

    const scene2 = await insertScenarioScenes(db, scenarioId, {
      sort_order: 1,
      mode: SceneMode.Image,
      fps: 30,
      duration_frames: 90,
      status: SceneStatus.Ready,
    },);

    const makeAsset = async (filename: string,) => {
      const id = `asset-${randomUUID()}`;
      const storagePath = `clips/${id}.webm`;
      await mkdir(join(uploadDir, "clips",), { recursive: true, },);
      await writeFile(join(uploadDir, storagePath,), Buffer.from(`bytes:${id}`,),);
      return insertAssets(db, ownerId, filename, "video/webm", AssetType.Video, 10, storagePath, { id, },);
    };

    const asset1 = await makeAsset("clip-a.webm",);
    const asset2 = await makeAsset("clip-b.webm",);

    const fragment2 = await insertScenarioFragments(db, scene2, FragmentOperation.Render, "wf", "sha256:seed", {
      status: FragmentStatus.Completed,
      output_asset_id: asset2,
      sort_order: 0,
      cut_in_ms: 100,
      duration_frames: 30,
      take: "take-2",
    },);

    const fragment1 = await insertScenarioFragments(db, scene1, FragmentOperation.Render, "wf", "sha256:seed", {
      status: FragmentStatus.Completed,
      output_asset_id: asset1,
      sort_order: 0,
      cut_in_ms: 0,
      take: "0",
    },);

    const cutPoints: AssemblyCutPoint[] = [
      { fragmentId: fragment1, startMs: 0, endMs: 2000, take: "0", },
      { fragmentId: fragment2, startMs: 100, endMs: 1100, take: "take-2", },
    ];

    return { db, ownerId, worldId, scenarioId, fragment1, fragment2, cutPoints, };
  }

  test("computes cut points, uploads clips and records completion", async () => {
    const seeded = await seed();
    const calls: StubCalls = { uploaded: [], loaded: [], submitted: 0, };
    const handle = await assembleScenario({
      database: seeded.db,
      uploadDir,
      ownerId: seeded.ownerId,
      scenarioId: seeded.scenarioId,
      client: makeClient(calls,),
      workflowId: "wf",
      workflowHash: "sha256:seed",
      workflowVersion: "v1",
      loadWorkflow: makeLoader(calls,),
    },);

    const result = await handle.done;
    expect(result.ok,).toBe(true,);
    if (!result.ok) { return; }

    expect(result.assemblyId,).toBe(handle.assemblyId,);
    expect(result.cutPoints,).toEqual(seeded.cutPoints,);
    expect(result.assetId,).toBeString();

    expect(calls.uploaded,).toEqual([
      `fragment-${seeded.fragment1}-clip-a.webm`,
      `fragment-${seeded.fragment2}-clip-b.webm`,
    ],);

    expect(calls.loaded.length,).toBe(1,);
    expect(calls.loaded[0]!.name,).toBe("wf",);
    expect(calls.loaded[0]!.vars,).toMatchObject({
      fragment_count: 2,
      clip_1: `comfy-fragment-${seeded.fragment1}-clip-a.webm`,
      clip_2: `comfy-fragment-${seeded.fragment2}-clip-b.webm`,
      cut_points: JSON.stringify(seeded.cutPoints,),
      fps: 24,
      scenario_id: seeded.scenarioId,
    },);

    const row = await seeded.db.selectFrom("scenario_assemblies",).selectAll()
      .where("id", "=", handle.assemblyId,).executeTakeFirstOrThrow();

    expect(row.version,).toBe(1,);
    expect(row.status,).toBe("completed",);
    expect(row.output_asset_id,).toBe(result.assetId,);
    expect(row.workflow_id,).toBe("wf",);
    expect(row.workflow_hash,).toBe("sha256:seed",);
    expect(row.workflow_version,).toBe("v1",);
    expect(row.error,).toBeNull();
    expect(JSON.parse(row.fragment_ids,),).toEqual([seeded.fragment1, seeded.fragment2,],);
    expect(JSON.parse(row.cut_points,),).toEqual(seeded.cutPoints,);
  });

  test("persists status and error on a failed assembly", async () => {
    const seeded = await seed();
    const calls: StubCalls = { uploaded: [], loaded: [], submitted: 0, };
    const client = makeClient(calls, {
      async waitForFiles() {
        return [{ kind: "other", file: { filename: "state.safetensors", }, },];
      },
    },);

    const handle = await assembleScenario({
      database: seeded.db,
      uploadDir,
      ownerId: seeded.ownerId,
      scenarioId: seeded.scenarioId,
      client,
      workflowId: "wf",
      workflowHash: "sha256:seed",
      loadWorkflow: makeLoader(calls,),
    },);

    const result = await handle.done;
    expect(result.ok,).toBe(false,);
    if (result.ok) { return; }
    expect(result.assemblyId,).toBe(handle.assemblyId,);
    expect(result.error,).toContain("no video output",);
    expect(result.status,).toBe(502,);

    const row = await seeded.db.selectFrom("scenario_assemblies",).selectAll()
      .where("id", "=", handle.assemblyId,).executeTakeFirstOrThrow();

    expect(row.status,).toBe("failed",);
    expect(row.error,).toBe(result.error,);
    expect(row.output_asset_id,).toBeNull();
    expect(await listAssemblies(seeded.db, seeded.scenarioId,),).toHaveLength(1,);
  });

  test("allocates versions 1 and 2 and lists newest first", async () => {
    const seeded = await seed();
    const calls: StubCalls = { uploaded: [], loaded: [], submitted: 0, };
    const opts = {
      database: seeded.db,
      uploadDir,
      ownerId: seeded.ownerId,
      scenarioId: seeded.scenarioId,
      client: makeClient(calls,),
      workflowId: "wf",
      workflowHash: "sha256:seed",
      loadWorkflow: makeLoader(calls,),
    };

    const first = await assembleScenario(opts,);
    const firstResult = await first.done;
    expect(firstResult.ok,).toBe(true,);

    const second = await assembleScenario(opts,);
    const secondResult = await second.done;
    expect(secondResult.ok,).toBe(true,);

    const history = await listAssemblies(seeded.db, seeded.scenarioId,);
    expect(history.map((row,) => row.version),).toEqual([2, 1,],);
    expect(history.map((row,) => row.id),).toEqual([second.assemblyId, first.assemblyId,],);
    expect(await getAssembly(seeded.db, seeded.scenarioId,),).toMatchObject({
      id: second.assemblyId,
      version: 2,
    },);
  });

  test("isolates assembly history by scenario", async () => {
    const seeded = await seed();
    const otherScenarioId = await insertScenarios(
      seeded.db,
      seeded.worldId,
      seeded.ownerId,
      "Other scenario",
    );

    const calls: StubCalls = { uploaded: [], loaded: [], submitted: 0, };
    const handle = await assembleScenario({
      database: seeded.db,
      uploadDir,
      ownerId: seeded.ownerId,
      scenarioId: seeded.scenarioId,
      client: makeClient(calls,),
      workflowId: "wf",
      workflowHash: "sha256:seed",
      loadWorkflow: makeLoader(calls,),
    },);

    const result = await handle.done;
    expect(result.ok,).toBe(true,);

    expect(await listAssemblies(seeded.db, otherScenarioId,),).toEqual([],);
    expect(await getAssembly(seeded.db, otherScenarioId,),).toBeUndefined();
    expect((await listAssemblies(seeded.db, seeded.scenarioId,)).length,).toBe(1,);
  });
});
