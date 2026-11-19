// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
// size-allow: 400

import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import { AssetType, } from "../../db/enums-content";
import {
  FragmentOperation,
  FragmentStatus,
  ReferenceLane,
  ScenarioDocKind,
  ScenarioStatus,
  SceneMode,
  SceneStatus,
} from "../../db/enums-generation";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import {
  insertAssets,
  insertScenarioDocs,
  insertScenarioFragments,
  insertScenarioReferences,
  insertScenarios,
  insertScenarioScenes,
  insertScenarioShots,
  insertUsers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { ivssAuthoringRoutes, } from "./authoring";

const OWNER = "ivss-author-owner";
const STRANGER = "ivss-author-stranger";
const WORLD = "ivss-author-world";
const DENIED = [401, 403, 404,];

interface TreeShot {
  id: string;
  startMs: number;
}
interface TreeFragment {
  id: string;
}
interface TreeScene {
  id: string;
  shots: TreeShot[];
  fragments: TreeFragment[];
}
interface TreeRef {
  id: string;
}
interface TreeDoc {
  kind: string;
}
interface ScenarioTree {
  id: string;
  createdAt: string;
  updatedAt: string;
  scenes: TreeScene[];
  references: TreeRef[];
  docs: TreeDoc[];
}

// Resource contract: every test owns a fresh in-memory SQLite DB, allocated in
// beforeEach and released in afterEach (including on failure). All ids and auth
// identities below are scoped to that private DB — no shared globals or paths.
let fixture: TestDb;

beforeEach(async () => {
  fixture = await createTestDb();
  await insertUsers(fixture.db, OWNER, "Owner", { id: OWNER, },);
  await insertUsers(fixture.db, STRANGER, "Stranger", { id: STRANGER, },);
  await insertWorlds(fixture.db, OWNER, "World", { id: WORLD, },);
},);

afterEach(async () => {
  await destroyTestDb(fixture,);
},);

/** @param userId - injected auth identity (null = anonymous) */
function app(userId: string | null,) {
  return new Elysia({ name: "test-ivss-authoring", },)
    .derive(() => ({ userId, userRole: "user", }))
    .use(ivssAuthoringRoutes({ database: fixture.db, },),);
}

/** @param body - JSON request body, omitted for GET/DELETE */
async function call(
  userId: string | null,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: Record<string, unknown>,
): Promise<Response> {
  return await app(userId,).handle(
    new Request(`http://localhost${path}`, {
      method,
      ...(body === undefined ? {} : {
        headers: { "content-type": "application/json", },
        body: JSON.stringify(body,),
      }),
    },),
  );
}

describe("IVSS authoring routes", () => {
  test("creates a scenario, scene, shot and fragment end to end", async () => {
    const scenarioRes = await call(OWNER, "POST", "/api/v1/ivss/scenarios", {
      worldId: WORLD,
      title: "Trailer",
    },);

    expect(scenarioRes.status,).toBe(201,);
    const scenario = await scenarioRes.json() as {
      id: string;
      worldId: string;
      status: string;
      updatedAt: string;
    };

    expect(scenario.worldId,).toBe(WORLD,);
    expect(scenario.status,).toBe(ScenarioStatus.Draft,);
    expect(scenario.updatedAt,).toContain("T",);

    const before = await fixture.db.selectFrom("scenarios",).select("updated_at",)
      .where("id", "=", scenario.id,).executeTakeFirstOrThrow();

    const sceneRes = await call(OWNER, "POST", `/api/v1/ivss/scenarios/${scenario.id}/scenes`, {
      mode: SceneMode.TextToVideo,
      durationFrames: 120,
      fps: 24,
      seed: "seed-1",
    },);

    expect(sceneRes.status,).toBe(201,);
    const scene = await sceneRes.json() as { id: string; sortOrder: number; status: string };
    expect(scene.sortOrder,).toBe(0,);
    expect(scene.status,).toBe(SceneStatus.Planned,);

    const shotRes = await call(OWNER, "POST", `/api/v1/ivss/scenes/${scene.id}/shots`, {
      startMs: 0,
      endMs: 5_000,
      description: "Opening",
    },);

    expect(shotRes.status,).toBe(201,);
    const shot = await shotRes.json() as { id: string; sortOrder: number };
    expect(shot.sortOrder,).toBe(0,);

    const fragmentRes = await call(OWNER, "POST", `/api/v1/ivss/scenes/${scene.id}/fragments`, {
      shotId: shot.id,
      operation: FragmentOperation.Render,
      workflowId: "h3-local",
      workflowHash: "hash-1",
      durationFrames: 120,
    },);

    expect(fragmentRes.status,).toBe(201,);
    const fragment = await fragmentRes.json() as {
      id: string;
      status: string;
      sortOrder: number;
      shotId: string;
    };

    expect(fragment.status,).toBe(FragmentStatus.Planned,);
    expect(fragment.sortOrder,).toBe(0,);
    expect(fragment.shotId,).toBe(shot.id,);

    const stored = await fixture.db.selectFrom("scenario_fragments",).selectAll()
      .where("id", "=", fragment.id,).executeTakeFirstOrThrow();

    expect(stored.workflow_id,).toBe("h3-local",);
    expect(stored.scene_id,).toBe(scene.id,);
    const after = await fixture.db.selectFrom("scenarios",).select("updated_at",)
      .where("id", "=", scenario.id,).executeTakeFirstOrThrow();

    expect(after.updated_at >= before.updated_at,).toBe(true,);
  });

  test("GET tree is ordered, nested and JSON-safe", async () => {
    const scenarioId = await insertScenarios(fixture.db, WORLD, OWNER, "Ordered",);
    const assetId = await insertAssets(fixture.db, OWNER, "ref.png", "image/png", AssetType.Image, 4, "ref.png", {
      id: "ivss-ref-asset",
    },);

    const sceneA = await insertScenarioScenes(fixture.db, scenarioId, {
      id: "scene-a",
      sort_order: 2,
    },);

    const sceneB = await insertScenarioScenes(fixture.db, scenarioId, {
      id: "scene-b",
      sort_order: 5,
    },);

    const shotA = await insertScenarioShots(fixture.db, sceneA, 1_000, "First", {
      id: "shot-a",
      sort_order: 1,
    },);

    const shotB = await insertScenarioShots(fixture.db, sceneA, 3_000, "Second", {
      id: "shot-b",
      sort_order: 9,
    },);

    const fragA = await insertScenarioFragments(fixture.db, sceneA, FragmentOperation.Render, "wf", "hash", {
      id: "frag-a",
      sort_order: 3,
    },);

    const fragB = await insertScenarioFragments(fixture.db, sceneA, FragmentOperation.Render, "wf", "hash", {
      id: "frag-b",
      sort_order: 7,
    },);

    const refA = await insertScenarioReferences(fixture.db, scenarioId, ReferenceLane.Image, assetId, {
      id: "ref-a",
      sort_order: 2,
    },);

    const refB = await insertScenarioReferences(fixture.db, scenarioId, ReferenceLane.Video, assetId, {
      id: "ref-b",
      sort_order: 8,
    },);

    await insertScenarioDocs(fixture.db, scenarioId, ScenarioDocKind.Synopsis, "later", {
      version: 2,
    },);

    await insertScenarioDocs(fixture.db, scenarioId, ScenarioDocKind.Plot, "first", {
      version: 1,
    },);

    const res = await call(OWNER, "GET", `/api/v1/ivss/scenarios/${scenarioId}`,);
    expect(res.status,).toBe(200,);
    const tree = await res.json() as ScenarioTree;
    expect(tree.id,).toBe(scenarioId,);
    expect(tree.scenes.map((scene,) => scene.id),).toEqual([sceneA, sceneB,],);
    expect(tree.scenes[0]!.shots.map((shot,) => shot.id),).toEqual([shotA, shotB,],);
    expect(tree.scenes[0]!.fragments.map((fragment,) => fragment.id),).toEqual([fragA, fragB,],);
    expect(tree.references.map((ref,) => ref.id),).toEqual([refA, refB,],);
    expect(tree.docs.map((doc,) => doc.kind),).toEqual([
      ScenarioDocKind.Plot,
      ScenarioDocKind.Synopsis,
    ],);

    expect(typeof tree.createdAt,).toBe("string",);
    expect(tree.createdAt,).toContain("T",);
    expect(typeof tree.updatedAt,).toBe("string",);
    expect(typeof tree.scenes[0]!.shots[0]!.startMs,).toBe("number",);
  });

  test("reorder assigns 0..n-1 and rejects duplicates, cross-parent and unowned ids", async () => {
    const first = await insertScenarios(fixture.db, WORLD, OWNER, "First",);
    const second = await insertScenarios(fixture.db, WORLD, OWNER, "Second",);
    const sceneA = await insertScenarioScenes(fixture.db, first, { id: "reorder-a", },);
    const sceneB = await insertScenarioScenes(fixture.db, first, { id: "reorder-b", },);
    const foreign = await insertScenarioScenes(fixture.db, second, { id: "reorder-foreign", },);
    const shotA = await insertScenarioShots(fixture.db, sceneA, 1_000, "a", {
      id: "reorder-shot-a",
    },);

    const shotB = await insertScenarioShots(fixture.db, sceneB, 1_000, "b", {
      id: "reorder-shot-b",
    },);

    const duplicate = await call(OWNER, "POST", "/api/v1/ivss/reorder", {
      kind: "scene",
      ids: [sceneA, sceneA,],
    },);

    expect(duplicate.status,).toBe(400,);

    const crossParent = await call(OWNER, "POST", "/api/v1/ivss/reorder", {
      kind: "scene",
      ids: [sceneA, foreign,],
    },);

    expect(crossParent.status,).toBe(409,);

    const crossParentShots = await call(OWNER, "POST", "/api/v1/ivss/reorder", {
      kind: "shot",
      ids: [shotA, shotB,],
    },);

    expect(crossParentShots.status,).toBe(409,);

    const unowned = await call(STRANGER, "POST", "/api/v1/ivss/reorder", {
      kind: "scene",
      ids: [sceneA,],
    },);

    expect(DENIED,).toContain(unowned.status,);

    const unchanged = await fixture.db.selectFrom("scenario_scenes",)
      .select("sort_order",).where("id", "=", sceneA,).executeTakeFirstOrThrow();

    expect(unchanged.sort_order,).toBe(0,);

    const ok = await call(OWNER, "POST", "/api/v1/ivss/reorder", {
      kind: "scene",
      ids: [sceneB, sceneA,],
    },);

    expect(ok.status,).toBe(200,);
    expect(await ok.json(),).toEqual([
      { id: sceneB, sortOrder: 0, },
      { id: sceneA, sortOrder: 1, },
    ],);

    const rows = await fixture.db.selectFrom("scenario_scenes",)
      .select(["id", "sort_order",],).where("id", "in", [sceneA, sceneB,],).execute();

    expect(rows.find((row,) => row.id === sceneA)?.sort_order,).toBe(1,);
    expect(rows.find((row,) => row.id === sceneB)?.sort_order,).toBe(0,);
  });

  test("unowned trees are hidden and cannot be mutated", async () => {
    const foreign = await insertScenarios(fixture.db, WORLD, STRANGER, "Foreign",);
    const scene = await insertScenarioScenes(fixture.db, foreign, { id: "foreign-scene", },);
    const shot = await insertScenarioShots(fixture.db, scene, 1_000, "foreign", {
      id: "foreign-shot",
    },);

    const fragment = await insertScenarioFragments(fixture.db, scene, FragmentOperation.Render, "wf", "hash", {
      id: "foreign-fragment",
    },);

    const results = await Promise.all([
      call(OWNER, "GET", `/api/v1/ivss/scenarios/${foreign}`,),
      call(OWNER, "POST", `/api/v1/ivss/scenarios/${foreign}/scenes`, {
        mode: SceneMode.TextToVideo,
        durationFrames: 10,
        fps: 24,
      },),
      call(OWNER, "PATCH", `/api/v1/ivss/scenes/${scene}`, { fps: 30, },),
      call(OWNER, "DELETE", `/api/v1/ivss/scenes/${scene}`,),
      call(OWNER, "POST", `/api/v1/ivss/scenes/${scene}/shots`, {
        startMs: 0,
        endMs: 100,
        description: "x",
      },),
      call(OWNER, "PATCH", `/api/v1/ivss/shots/${shot}`, { description: "x", },),
      call(OWNER, "DELETE", `/api/v1/ivss/shots/${shot}`,),
      call(OWNER, "POST", `/api/v1/ivss/scenes/${scene}/fragments`, {
        operation: FragmentOperation.Render,
        workflowId: "wf",
        workflowHash: "hash",
      },),
      call(OWNER, "PATCH", `/api/v1/ivss/fragments/${fragment}`, { caption: "x", },),
      call(OWNER, "DELETE", `/api/v1/ivss/fragments/${fragment}`,),
      call(OWNER, "POST", "/api/v1/ivss/reorder", { kind: "scene", ids: [scene,], },),
    ],);

    for (const res of results) {
      expect(DENIED,).toContain(res.status,);
    }

    const stored = await fixture.db.selectFrom("scenarios",).select("id",)
      .where("id", "=", foreign,).execute();

    expect(stored,).toHaveLength(1,);
    const listRes = await call(OWNER, "GET", "/api/v1/ivss/scenarios",);
    const list = await listRes.json() as Array<{ id: string }>;
    expect(list.some((row,) => row.id === foreign),).toBe(false,);
    expect((await call(null, "GET", "/api/v1/ivss/scenarios",)).status,).toBe(401,);
  });

  test("fragment PATCH cannot change status or output fields", async () => {
    const scenario = await insertScenarios(fixture.db, WORLD, OWNER, "Patch",);
    const scene = await insertScenarioScenes(fixture.db, scenario, {},);
    const fragment = await insertScenarioFragments(fixture.db, scene, FragmentOperation.Render, "wf", "hash", {
      status: FragmentStatus.Planned,
    },);

    const rejected = await call(OWNER, "PATCH", `/api/v1/ivss/fragments/${fragment}`, {
      status: FragmentStatus.Completed,
      outputAssetId: "injected",
      caption: "allowed",
    },);

    expect([200, 400, 422,],).toContain(rejected.status,);
    const row = await fixture.db.selectFrom("scenario_fragments",).selectAll()
      .where("id", "=", fragment,).executeTakeFirstOrThrow();

    expect(row.status,).toBe(FragmentStatus.Planned,);
    expect(row.output_asset_id,).toBeNull();

    const patched = await call(OWNER, "PATCH", `/api/v1/ivss/fragments/${fragment}`, {
      caption: "legit",
    },);

    expect(patched.status,).toBe(200,);
    const after = await fixture.db.selectFrom("scenario_fragments",).selectAll()
      .where("id", "=", fragment,).executeTakeFirstOrThrow();

    expect(after.caption,).toBe("legit",);
    expect(after.status,).toBe(FragmentStatus.Planned,);
  });

  test("invalid shot timing and cross-scene shot references are rejected", async () => {
    const scenario = await insertScenarios(fixture.db, WORLD, OWNER, "Validation",);
    const scene = await insertScenarioScenes(fixture.db, scenario, { id: "valid-scene", },);
    const other = await insertScenarioScenes(fixture.db, scenario, { id: "other-scene", },);
    const otherShot = await insertScenarioShots(fixture.db, other, 1_000, "elsewhere", {
      id: "other-shot",
    },);

    const badTiming = await call(OWNER, "POST", `/api/v1/ivss/scenes/${scene}/shots`, {
      startMs: 500,
      endMs: 500,
      description: "bad",
    },);

    expect(badTiming.status,).toBe(400,);
    expect(
      await fixture.db.selectFrom("scenario_shots",).select("id",)
        .where("scene_id", "=", scene,).execute(),
    ).toHaveLength(0,);

    const badShotRef = await call(OWNER, "POST", `/api/v1/ivss/scenes/${scene}/fragments`, {
      shotId: otherShot,
      operation: FragmentOperation.Render,
      workflowId: "wf",
      workflowHash: "hash",
    },);

    expect(badShotRef.status,).toBe(400,);
    expect(
      await fixture.db.selectFrom("scenario_fragments",).select("id",)
        .where("scene_id", "=", scene,).execute(),
    ).toHaveLength(0,);
  });
});
