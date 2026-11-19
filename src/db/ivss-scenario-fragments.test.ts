// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { createTestDb, destroyTestDb, type TestDb, } from "../test-utils/create-test-db";
import {
  insertAssets,
  insertScenarioFragments,
  insertScenarios,
  insertScenarioScenes,
  insertScenarioShots,
  insertUsers,
  insertWorlds,
} from "../test-utils/insert-helpers";
import {
  AssetType,
  CutType,
  FragmentOperation,
  FragmentStatus,
  ScenarioStatus,
  SceneMode,
  SceneStatus,
} from "./enums";

describe("IVSS scenario fragment schema", () => {
  let fixture: TestDb;

  beforeAll(async () => {
    fixture = await createTestDb();
  },);

  afterAll(async () => {
    await destroyTestDb(fixture,);
  },);

  test("scene/shot/fragment graph keeps big seeds and distinct video and latent assets", async () => {
    const { db, } = fixture;
    const ownerId = await insertUsers(db, "ivss-owner", "IVSS Owner",);
    const worldId = await insertWorlds(db, ownerId, "IVSS World",);
    const scenarioId = await insertScenarios(db, worldId, ownerId, "Launch", { status: ScenarioStatus.Draft, },);
    const sceneId = await insertScenarioScenes(db, scenarioId, {
      id: "scene-1",
      mode: SceneMode.Image,
      seed: "9007199254740993",
      status: SceneStatus.Planned,
    },);

    const shotId = await insertScenarioShots(db, sceneId, 2000, "Opening", { id: "shot-1", },);
    const videoId = await insertAssets(db, ownerId, "clip.mp4", "video/mp4", AssetType.Video, 10, "clip.mp4", {
      id: "clip-asset",
    },);

    const latentId = await insertAssets(
      db,
      ownerId,
      "latent.bin",
      "application/octet-stream",
      AssetType.Other,
      10,
      "latent.bin",
      { id: "latent-asset", },
    );

    const fragmentId = await insertScenarioFragments(db, sceneId, FragmentOperation.Render, "h3-local", "sha256:abc", {
      id: "fragment-1",
      shot_id: shotId,
      status: FragmentStatus.Planned,
      transition: CutType.HardCut,
      seed: "9007199254740995",
      take: "9007199254740997",
      cut_in_ms: 0,
      cut_out_ms: 2000,
      prompt_snapshot: "[Shot 1] dusk",
      output_asset_id: videoId,
      latent_asset_id: latentId,
    },);

    const fragment = await db.selectFrom("scenario_fragments",)
      .selectAll()
      .where("id", "=", fragmentId,)
      .executeTakeFirstOrThrow();

    expect(fragment.seed,).toBe("9007199254740995",);
    expect(fragment.take,).toBe("9007199254740997",);
    expect(fragment.output_asset_id,).toBe(videoId,);
    expect(fragment.latent_asset_id,).toBe(latentId,);
    expect(fragment.output_asset_id,).not.toBe(fragment.latent_asset_id,);
  });

  test("shots and fragments outside a scene are rejected", async () => {
    const { db, } = fixture;
    expect(insertScenarioShots(db, "missing-scene", 1000, "orphan", { id: "orphan-shot", },),).rejects.toThrow();
    expect(insertScenarioFragments(db, "missing-scene", "render", "h3-local", "sha256:abc", {
      id: "orphan-fragment",
    },),).rejects.toThrow();
  });

  test("a retake links to its parent without touching sibling fragments", async () => {
    const { db, } = fixture;
    const scene = await db.selectFrom("scenario_scenes",).select("id",).where("id", "=", "scene-1",)
      .executeTakeFirstOrThrow();

    await insertScenarioFragments(db, scene.id, "render", "h3-local", "sha256:abc", {
      id: "fragment-2",
      shot_id: "shot-1",
    },);

    await insertScenarioFragments(db, scene.id, FragmentOperation.Rerender, "custom-cut", "sha256:def", {
      id: "fragment-2-retake",
      shot_id: "shot-1",
      parent_fragment_id: "fragment-2",
      take: "1",
    },);

    const rows = await db.selectFrom("scenario_fragments",)
      .select(["id", "parent_fragment_id", "status",],)
      .where("scene_id", "=", scene.id,)
      .orderBy("id",)
      .execute();

    expect(rows.length,).toBe(3,);
    const retake = rows.find((row,) => row.id === "fragment-2-retake");
    expect(retake?.parent_fragment_id,).toBe("fragment-2",);
    const sibling = rows.find((row,) => row.id === "fragment-1");
    expect(sibling?.parent_fragment_id,).toBeNull();
  });
});
