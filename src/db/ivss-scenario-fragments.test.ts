// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { randomUUID, } from "node:crypto";
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

// Resource contract: every test owns a fresh in-memory DB (beforeEach/afterEach)
// and generates its own ids. No test reads rows another test inserted.
describe("IVSS scenario fragment schema", () => {
  let fixture: TestDb;

  beforeEach(async () => {
    fixture = await createTestDb();
  },);

  afterEach(async () => {
    await destroyTestDb(fixture,);
  },);

  const seedScene = async (db: TestDb["db"],) => {
    const ownerId = await insertUsers(db, `ivss-owner-${randomUUID()}`, "IVSS Owner",);
    const worldId = await insertWorlds(db, ownerId, "IVSS World",);
    const scenarioId = await insertScenarios(db, worldId, ownerId, "Launch", { status: ScenarioStatus.Draft, },);
    const sceneId = await insertScenarioScenes(db, scenarioId, {
      mode: SceneMode.Image,
      seed: "9007199254740993",
      status: SceneStatus.Planned,
    },);

    const shotId = await insertScenarioShots(db, sceneId, 2000, "Opening",);
    return { ownerId, sceneId, shotId, };
  };

  test("scene/shot/fragment graph keeps big seeds and distinct video and latent assets", async () => {
    const { db, } = fixture;
    const { ownerId, sceneId, shotId, } = await seedScene(db,);
    const videoId = await insertAssets(db, ownerId, "clip.mp4", "video/mp4", AssetType.Video, 10, "clip.mp4", {
      id: `clip-${randomUUID()}`,
    },);

    const latentId = await insertAssets(
      db,
      ownerId,
      "latent.bin",
      "application/octet-stream",
      AssetType.Other,
      10,
      "latent.bin",
      { id: `latent-${randomUUID()}`, },
    );

    const fragmentId = await insertScenarioFragments(db, sceneId, FragmentOperation.Render, "h3-local", "sha256:abc", {
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
    expect(insertScenarioShots(db, `missing-${randomUUID()}`, 1000, "orphan",),).rejects.toThrow();
    expect(insertScenarioFragments(db, `missing-${randomUUID()}`, "render", "h3-local", "sha256:abc", {},),).rejects
      .toThrow();
  });

  test("a retake links to its parent without touching sibling fragments", async () => {
    const { db, } = fixture;
    const { sceneId, shotId, } = await seedScene(db,);

    const originalId = await insertScenarioFragments(db, sceneId, FragmentOperation.Render, "h3-local", "sha256:abc", {
      shot_id: shotId,
    },);

    await insertScenarioFragments(db, sceneId, FragmentOperation.Rerender, "custom-cut", "sha256:def", {
      shot_id: shotId,
      parent_fragment_id: originalId,
      take: "1",
    },);

    const rows = await db.selectFrom("scenario_fragments",)
      .select(["id", "parent_fragment_id", "status",],)
      .where("scene_id", "=", sceneId,)
      .orderBy("id",)
      .execute();

    expect(rows.length,).toBe(2,);
    const retake = rows.find((row,) => row.parent_fragment_id === originalId);
    expect(retake?.status,).toBe(FragmentStatus.Planned,);
    expect(rows.find((row,) => row.id === originalId)?.parent_fragment_id,).toBeNull();
  });
});
