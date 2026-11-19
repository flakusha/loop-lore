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
  insertScenarioShots,
  insertUsers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { createIvssFragmentRetake, resolveRetakeLatent, } from "./retake";
import { type IvssComfyClient, startIvssFragmentRun, } from "./run-pipeline";

describe("IVSS latent retake", () => {
  let fixture: TestDb;
  let uploadDir: string;

  beforeEach(async () => {
    fixture = await createTestDb();
    uploadDir = await mkdtemp(join(tmpdir(), "ivss-retake-",),);
  }, 20_000,);

  afterEach(async () => {
    if (uploadDir) { await rm(uploadDir, { recursive: true, force: true, },); }
    if (fixture) { await destroyTestDb(fixture,); }
  }, 20_000,);

  const seed = async () => {
    const db = fixture.db;
    const ownerId = await insertUsers(db, `owner-${randomUUID()}`, "Owner",);
    const worldId = await insertWorlds(db, ownerId, "World",);
    const scenarioId = await insertScenarios(db, worldId, ownerId, "Scenario",);
    const sceneId = await insertScenarioScenes(db, scenarioId, {
      mode: SceneMode.Image,
      seed: "9007199254740995",
      status: SceneStatus.Planned,
    },);

    await insertScenarioShots(db, sceneId, 1500, "Dusk",);
    const fragmentId = await insertScenarioFragments(db, sceneId, FragmentOperation.Render, "h3-local", "sha256:abc", {
      status: FragmentStatus.Planned,
    },);

    return { db, ownerId, scenarioId, sceneId, fragmentId, };
  };

  const seedLatent = async (ownerId: string,) => {
    const id = `latent-${randomUUID()}`;
    const storagePath = `latents/${id}.latent`;
    await mkdir(join(uploadDir, "latents",), { recursive: true, },);
    await writeFile(join(uploadDir, storagePath,), Buffer.from(`latent:${id}`,),);
    await insertAssets(
      fixture.db,
      ownerId,
      `${id}.latent`,
      "application/octet-stream",
      AssetType.Other,
      16,
      storagePath,
      { id, },
    );

    return id;
  };

  const completeSource = async (fragmentId: string, latentAssetId: string,) => {
    await fixture.db.updateTable("scenario_fragments",).set({
      status: FragmentStatus.Completed,
      latent_asset_id: latentAssetId,
    },).where("id", "=", fragmentId,).execute();
  };

  const renderClient = (): IvssComfyClient => ({
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
  });

  test("creates a child fragment pinned to the parent latent", async () => {
    const seeded = await seed();
    const latentId = await seedLatent(seeded.ownerId,);
    await completeSource(seeded.fragmentId, latentId,);

    const retake = await createIvssFragmentRetake({
      database: seeded.db,
      fragmentId: seeded.fragmentId,
      ownerId: seeded.ownerId,
      now: () => 1_700_000_000_000,
    },);

    expect(retake.parentFragmentId,).toBe(seeded.fragmentId,);
    expect(retake.latentAssetId,).toBe(latentId,);
    expect(retake.take,).toBe("1",);
    const child = await seeded.db.selectFrom("scenario_fragments",).selectAll()
      .where("id", "=", retake.fragmentId,).executeTakeFirstOrThrow();

    expect(child.status,).toBe(FragmentStatus.Planned,);
    expect(child.parent_fragment_id,).toBe(seeded.fragmentId,);
    expect(child.workflow_hash,).toBe("sha256:abc",);
    expect(child.latent_asset_id,).toBeNull();
    expect(JSON.parse(child.input_assets!,),).toEqual({
      latent: latentId,
      parent_fragment: seeded.fragmentId,
    },);
  });

  test("resume injects the latent into workflow variables", async () => {
    const seeded = await seed();
    const latentId = await seedLatent(seeded.ownerId,);
    await completeSource(seeded.fragmentId, latentId,);
    const retake = await createIvssFragmentRetake({
      database: seeded.db,
      fragmentId: seeded.fragmentId,
      ownerId: seeded.ownerId,
    },);

    const loaded: Array<Record<string, string | number | boolean>> = [];

    const handle = await startIvssFragmentRun({
      database: seeded.db,
      uploadDir,
      ownerId: seeded.ownerId,
      fragmentId: retake.fragmentId,
      resumeFromFragmentId: seeded.fragmentId,
      assetUrl: async (assetId,) => `https://comfy.example/assets/${assetId}`,
      client: renderClient(),
      loadWorkflow: async (_name, vars,) => {
        loaded.push(vars,);
        return { "1": { class_type: "Stub", inputs: {}, }, };
      },
      dispatch: async (opts,) => {
        await opts.run?.();
      },
    },);

    const result = await handle.done;

    expect(result.ok,).toBe(true,);
    if (!result.ok) { return; }
    expect(result.resumedFromTake,).toBe("0",);
    expect(String(loaded[0]?.latent_path,),).toContain(`${latentId}.latent`,);
    expect(loaded[0]?.latent_url,).toBe(`https://comfy.example/assets/${latentId}`,);
    expect(loaded[0]?.latent_asset_id,).toBe(latentId,);
    expect(loaded[0]?.resume_from_take,).toBe("0",);
    const child = await seeded.db.selectFrom("scenario_fragments",).selectAll()
      .where("id", "=", retake.fragmentId,).executeTakeFirstOrThrow();

    expect(JSON.parse(child.input_assets!,),).toEqual({
      latent: retake.latentAssetId,
      parent_fragment: seeded.fragmentId,
    },);
  });

  test("resume without a resolver exposes no latent_url", async () => {
    const seeded = await seed();
    const latentId = await seedLatent(seeded.ownerId,);
    await completeSource(seeded.fragmentId, latentId,);
    const retake = await createIvssFragmentRetake({
      database: seeded.db,
      fragmentId: seeded.fragmentId,
      ownerId: seeded.ownerId,
    },);

    const loaded: Array<Record<string, string | number | boolean>> = [];
    const handle = await startIvssFragmentRun({
      database: seeded.db,
      uploadDir,
      ownerId: seeded.ownerId,
      fragmentId: retake.fragmentId,
      resumeFromFragmentId: seeded.fragmentId,
      client: renderClient(),
      loadWorkflow: async (_name, vars,) => {
        loaded.push(vars,);
        return { "1": { class_type: "Stub", inputs: {}, }, };
      },
      dispatch: async (opts,) => {
        await opts.run?.();
      },
    },);

    const result = await handle.done;
    expect(result.ok,).toBe(true,);
    expect(loaded[0]?.latent_url,).toBeUndefined();
    expect(String(loaded[0]?.latent_path,),).toContain(`${latentId}.latent`,);
  });

  test("rejects a parent with a different workflow pin", async () => {
    const seeded = await seed();
    const latentId = await seedLatent(seeded.ownerId,);
    await completeSource(seeded.fragmentId, latentId,);
    const childId = await insertScenarioFragments(
      seeded.db,
      seeded.sceneId,
      FragmentOperation.Render,
      "h3-local",
      "sha256:different",
      {
        parent_fragment_id: seeded.fragmentId,
        take: "1",
      },
    );

    const child = await seeded.db.selectFrom("scenario_fragments",).selectAll()
      .where("id", "=", childId,).executeTakeFirstOrThrow();

    await expect(resolveRetakeLatent({
      database: seeded.db,
      uploadDir,
      ownerId: seeded.ownerId,
      fragment: child,
      resumeFromFragmentId: seeded.fragmentId,
    },),).rejects.toThrow(/workflow pin differs/,);
  });
});
