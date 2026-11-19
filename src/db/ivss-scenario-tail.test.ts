// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { randomUUID, } from "node:crypto";
import { createTestDb, destroyTestDb, type TestDb, } from "../test-utils/create-test-db";
import {
  insertAnnotations,
  insertAssets,
  insertScenarioDocs,
  insertScenarioReferences,
  insertScenarios,
  insertScenarioScenes,
  insertScenarioShots,
  insertUsers,
  insertWorlds,
} from "../test-utils/insert-helpers";
import {
  AnnotationTargetType,
  AssetType,
  ReferenceLane,
  ReferenceScope,
  ScenarioDocKind,
  ScenarioStatus,
  SceneMode,
  SceneStatus,
} from "./enums";

// Resource contract: each test owns a fresh in-memory DB and generates its own
// ids. No test reads rows another test inserted.
describe("IVSS scenario tail schema", () => {
  let fixture: TestDb;

  beforeEach(async () => {
    fixture = await createTestDb();
  },);

  afterEach(async () => {
    await destroyTestDb(fixture,);
  },);

  const seedGraph = async (db: TestDb["db"],) => {
    const ownerId = await insertUsers(db, "tail-owner-" + randomUUID(), "Tail Owner",);
    const worldId = await insertWorlds(db, ownerId, "Tail World",);
    const scenarioId = await insertScenarios(db, worldId, ownerId, "Tail", {
      status: ScenarioStatus.Draft,
    },);

    const sceneId = await insertScenarioScenes(db, scenarioId, {
      mode: SceneMode.Image,
      status: SceneStatus.Planned,
    },);

    const shotId = await insertScenarioShots(db, sceneId, 2000, "Opening",);
    const assetId = await insertAssets(db, ownerId, "ref.png", "image/png", AssetType.Image, 10, "ref.png", {
      id: "ref-" + randomUUID(),
    },);

    return { assetId, ownerId, scenarioId, sceneId, shotId, };
  };

  test("references, docs and annotations round-trip", async () => {
    const { db, } = fixture;
    const { assetId, ownerId, scenarioId, sceneId, shotId, } = await seedGraph(db,);

    const refId = await insertScenarioReferences(db, scenarioId, ReferenceLane.Image, assetId, {
      scope: ReferenceScope.Shot,
      scene_id: sceneId,
      shot_id: shotId,
      role: "identity",
      sort_order: 3,
      trim_out_ms: 2000,
      stream: "V",
    },);

    const docId = await insertScenarioDocs(db, scenarioId, ScenarioDocKind.Synopsis, "A dusk arrival", {
      version: 4,
    },);

    const annotationId = await insertAnnotations(
      db,
      AnnotationTargetType.Fragment,
      "fragment-" + randomUUID(),
      ownerId,
      250,
      "Trim the tail",
      { region: JSON.stringify({ x: 1, },), t1_ms: 900, },
    );

    await db.updateTable("annotations",).set({ resolved_at: "2026-11-19 00:00:00", resolved_by: ownerId, },)
      .where("id", "=", annotationId,).execute();

    const ref = await db.selectFrom("scenario_references",).selectAll()
      .where("id", "=", refId,).executeTakeFirstOrThrow();

    expect(ref.scope,).toBe(ReferenceScope.Shot,);
    expect(ref.lane,).toBe(ReferenceLane.Image,);
    expect(ref.shot_id,).toBe(shotId,);
    expect(ref.trim_out_ms,).toBe(2000,);

    const doc = await db.selectFrom("scenario_docs",).selectAll()
      .where("id", "=", docId,).executeTakeFirstOrThrow();

    expect(doc.body,).toBe("A dusk arrival",);
    expect(doc.version,).toBe(4,);

    const annotation = await db.selectFrom("annotations",).selectAll()
      .where("id", "=", annotationId,).executeTakeFirstOrThrow();

    expect(annotation.resolved_by,).toBe(ownerId,);
    expect(annotation.region,).toBe(JSON.stringify({ x: 1, },),);
  });

  test("scope and doc-kind constraints reject inconsistent rows", async () => {
    const { db, } = fixture;
    const { assetId, scenarioId, sceneId, } = await seedGraph(db,);

    expect(insertScenarioReferences(db, scenarioId, ReferenceLane.Image, assetId, {
      scope: ReferenceScope.Scenario,
      scene_id: sceneId,
    },),).rejects.toThrow();

    expect(insertScenarioReferences(db, scenarioId, ReferenceLane.Audio, assetId, {
      scope: ReferenceScope.Shot,
      scene_id: sceneId,
    },),).rejects.toThrow();

    expect(insertScenarioDocs(db, scenarioId, ScenarioDocKind.Plot, "one",),).resolves.toBeString();
    expect(insertScenarioDocs(db, scenarioId, ScenarioDocKind.Plot, "two",),).rejects.toThrow();
  });

  test("scenario deletion cascades references and docs", async () => {
    const { db, } = fixture;
    const { assetId, scenarioId, sceneId, } = await seedGraph(db,);
    await insertScenarioReferences(db, scenarioId, ReferenceLane.Image, assetId, {
      scope: ReferenceScope.Scene,
      scene_id: sceneId,
    },);

    await insertScenarioDocs(db, scenarioId, ScenarioDocKind.Soundscape, "rain",);

    await db.deleteFrom("scenarios",).where("id", "=", scenarioId,).execute();

    expect(await db.selectFrom("scenario_references",).select("id",).execute(),).toEqual([],);
    expect(await db.selectFrom("scenario_docs",).select("id",).execute(),).toEqual([],);
  });
});
