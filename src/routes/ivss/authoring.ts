// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
// size-allow: 780

/**
 * IVSS authoring API — scenarios, scenes, shots and render fragments.
 *
 * Every handler resolves ownership through `scenarios.owner_id`; nested rows
 * join back to that parent, so a caller can only ever touch their own tree.
 */
import { Elysia, t, } from "elysia";
import type { Kysely, Selectable, } from "kysely";
import {
  CutType,
  FragmentOperation,
  FragmentStatus,
  ScenarioStatus,
  SceneMode,
  SceneStatus,
} from "../../db/enums-generation";
import type { DB, } from "../../db/schema";
import { sqliteUtcToIso, toDate, } from "../../utils/date";
import { extractAuth, HttpStatus, jsonError, jsonResponse, requireUserId, } from "../http-utils";
import { requireWorldAccess, } from "../worlds/access";

type ScenarioRow = Selectable<DB["scenarios"]>;
type SceneRow = Selectable<DB["scenario_scenes"]>;
type ShotRow = Selectable<DB["scenario_shots"]>;
type FragmentRow = Selectable<DB["scenario_fragments"]>;
type ReferenceRow = Selectable<DB["scenario_references"]>;
type DocRow = Selectable<DB["scenario_docs"]>;
type Owned<T,> = T & { owner_id: string };

type ReorderKind = "scene" | "shot" | "fragment";
interface ReorderRow {
  id: string;
  scenarioId: string;
  sceneId: string | null;
}

const idParam = t.Object({ id: t.String(), },);
const nullableText = () => t.Union([t.String(), t.Null(),],);
const nullableNumber = () => t.Union([t.Number(), t.Null(),],);

const scenarioBody = t.Object({ worldId: t.String(), title: t.String(), },);
const sceneBody = t.Object({
  locationId: t.Optional(nullableText(),),
  mode: t.String(),
  durationFrames: t.Integer(),
  fps: t.Integer(),
  seed: t.Optional(nullableText(),),
},);

const scenePatch = t.Object({
  sortOrder: t.Optional(t.Integer(),),
  locationId: t.Optional(nullableText(),),
  mode: t.Optional(t.String(),),
  durationFrames: t.Optional(t.Integer(),),
  fps: t.Optional(t.Integer(),),
  seed: t.Optional(nullableText(),),
  status: t.Optional(t.String(),),
},);

const shotBody = t.Object({
  startMs: t.Number(),
  endMs: t.Number(),
  description: t.String(),
  cutType: t.Optional(t.String(),),
  cameraJson: t.Optional(nullableText(),),
  narration: t.Optional(nullableText(),),
},);

const shotPatch = t.Object({
  sortOrder: t.Optional(t.Integer(),),
  startMs: t.Optional(t.Number(),),
  endMs: t.Optional(t.Number(),),
  description: t.Optional(t.String(),),
  cutType: t.Optional(t.String(),),
  cameraJson: t.Optional(nullableText(),),
  narration: t.Optional(nullableText(),),
},);

const fragmentBody = t.Object({
  shotId: t.Optional(nullableText(),),
  operation: t.String(),
  workflowId: t.String(),
  workflowHash: t.String(),
  workflowVersion: t.Optional(nullableText(),),
  nodeVersions: t.Optional(nullableText(),),
  mode: t.Optional(nullableText(),),
  seed: t.Optional(nullableText(),),
  durationFrames: t.Optional(nullableNumber(),),
  transition: t.Optional(t.String(),),
  promptSnapshot: t.Optional(nullableText(),),
  galleryAssetId: t.Optional(nullableText(),),
  caption: t.Optional(nullableText(),),
  inputAssets: t.Optional(nullableText(),),
},);

const fragmentPatch = t.Object({
  operation: t.Optional(t.String(),),
  transition: t.Optional(t.String(),),
  promptSnapshot: t.Optional(nullableText(),),
  galleryAssetId: t.Optional(nullableText(),),
  caption: t.Optional(nullableText(),),
  inputAssets: t.Optional(nullableText(),),
  cutInMs: t.Optional(t.Number(),),
  cutOutMs: t.Optional(nullableNumber(),),
  sortOrder: t.Optional(t.Integer(),),
  seed: t.Optional(nullableText(),),
  durationFrames: t.Optional(nullableNumber(),),
  mode: t.Optional(nullableText(),),
  workflowId: t.Optional(t.String(),),
  workflowHash: t.Optional(t.String(),),
  workflowVersion: t.Optional(nullableText(),),
  nodeVersions: t.Optional(nullableText(),),
},);

const reorderBody = t.Object({ kind: t.String(), ids: t.Array(t.String(),), },);

/** Fields that must never be writable through the fragment authoring PATCH. */
const FORBIDDEN_FRAGMENT_PATCH = [
  "status",
  "outputAssetId",
  "latentAssetId",
  "parentFragmentId",
  "take",
  "error",
  "promptMessageId",
  "shotId",
  "sceneId",
  "id",
  "createdAt",
  "updatedAt",
] as const;

/** @param value - stored SQLite `datetime('now')` text or an ISO string */
function iso(value: string,): string {
  return sqliteUtcToIso(value,) || toDate(value,).toISOString();
}

/**
 * Narrow a request string against an enum-like constant object.
 * @param allowed - enum constant object
 * @param value - caller-supplied value
 */
function oneOf<T extends Record<string, string>,>(
  allowed: T,
  value: string,
): value is T[keyof T] {
  return (Object.values(allowed,) as string[]).includes(value,);
}

const notFound = () => jsonError("IVSS resource not found", HttpStatus.NotFound,);

function scenarioSummary(row: ScenarioRow,) {
  return {
    id: row.id,
    worldId: row.world_id,
    title: row.title,
    status: row.status,
    updatedAt: iso(row.updated_at,),
  };
}

function sceneView(row: SceneRow,) {
  return {
    id: row.id,
    scenarioId: row.scenario_id,
    sortOrder: row.sort_order,
    locationId: row.location_id,
    mode: row.mode,
    durationFrames: row.duration_frames,
    fps: row.fps,
    seed: row.seed,
    status: row.status,
    generatedAssetId: row.generated_asset_id,
    createdAt: iso(row.created_at,),
    updatedAt: iso(row.updated_at,),
  };
}

function shotView(row: ShotRow,) {
  return {
    id: row.id,
    sceneId: row.scene_id,
    sortOrder: row.sort_order,
    startMs: row.start_ms,
    endMs: row.end_ms,
    description: row.description,
    cutType: row.cut_type,
    cameraJson: row.camera_json,
    narration: row.narration,
  };
}

function fragmentView(row: FragmentRow,) {
  return {
    id: row.id,
    sceneId: row.scene_id,
    shotId: row.shot_id,
    sortOrder: row.sort_order,
    operation: row.operation,
    status: row.status,
    workflowId: row.workflow_id,
    workflowHash: row.workflow_hash,
    workflowVersion: row.workflow_version,
    nodeVersions: row.node_versions,
    mode: row.mode,
    seed: row.seed,
    durationFrames: row.duration_frames,
    transition: row.transition,
    promptMessageId: row.prompt_message_id,
    promptSnapshot: row.prompt_snapshot,
    galleryAssetId: row.gallery_asset_id,
    caption: row.caption,
    inputAssets: row.input_assets,
    outputAssetId: row.output_asset_id,
    latentAssetId: row.latent_asset_id,
    parentFragmentId: row.parent_fragment_id,
    take: row.take,
    cutInMs: row.cut_in_ms,
    cutOutMs: row.cut_out_ms,
    error: row.error,
    createdAt: iso(row.created_at,),
    updatedAt: iso(row.updated_at,),
  };
}

function referenceView(row: ReferenceRow,) {
  return {
    id: row.id,
    scenarioId: row.scenario_id,
    sceneId: row.scene_id,
    shotId: row.shot_id,
    scope: row.scope,
    lane: row.lane,
    role: row.role,
    assetId: row.asset_id,
    sortOrder: row.sort_order,
    trimInMs: row.trim_in_ms,
    trimOutMs: row.trim_out_ms,
    stream: row.stream,
    createdAt: iso(row.created_at,),
    updatedAt: iso(row.updated_at,),
  };
}

function docView(row: DocRow,) {
  return {
    id: row.id,
    scenarioId: row.scenario_id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    version: row.version,
    createdAt: iso(row.created_at,),
    updatedAt: iso(row.updated_at,),
  };
}

/** @returns the caller's scenario, or null when absent or not owned */
async function ownedScenario(
  database: Kysely<DB>,
  id: string,
  userId: string,
): Promise<ScenarioRow | null> {
  return await database
    .selectFrom("scenarios",)
    .selectAll()
    .where("id", "=", id,)
    .where("owner_id", "=", userId,)
    .executeTakeFirst() ?? null;
}

/** @returns a scene joined to its owning scenario */
async function ownedScene(
  database: Kysely<DB>,
  id: string,
  userId: string,
): Promise<Owned<SceneRow> | null> {
  return await database
    .selectFrom("scenario_scenes",)
    .innerJoin("scenarios", "scenarios.id", "scenario_scenes.scenario_id",)
    .selectAll("scenario_scenes",)
    .select("scenarios.owner_id as owner_id",)
    .where("scenario_scenes.id", "=", id,)
    .where("scenarios.owner_id", "=", userId,)
    .executeTakeFirst() ?? null;
}

/** @returns a shot with its scene and owning scenario ids */
async function ownedShot(
  database: Kysely<DB>,
  id: string,
  userId: string,
): Promise<(Owned<ShotRow> & { scenario_id: string }) | null> {
  return await database
    .selectFrom("scenario_shots",)
    .innerJoin("scenario_scenes", "scenario_scenes.id", "scenario_shots.scene_id",)
    .innerJoin("scenarios", "scenarios.id", "scenario_scenes.scenario_id",)
    .selectAll("scenario_shots",)
    .select(["scenarios.owner_id as owner_id", "scenarios.id as scenario_id",],)
    .where("scenario_shots.id", "=", id,)
    .where("scenarios.owner_id", "=", userId,)
    .executeTakeFirst() ?? null;
}

/** @returns a fragment with its scene and owning scenario ids */
async function ownedFragment(
  database: Kysely<DB>,
  id: string,
  userId: string,
): Promise<(Owned<FragmentRow> & { scenario_id: string }) | null> {
  return await database
    .selectFrom("scenario_fragments",)
    .innerJoin("scenario_scenes", "scenario_scenes.id", "scenario_fragments.scene_id",)
    .innerJoin("scenarios", "scenarios.id", "scenario_scenes.scenario_id",)
    .selectAll("scenario_fragments",)
    .select(["scenarios.owner_id as owner_id", "scenarios.id as scenario_id",],)
    .where("scenario_fragments.id", "=", id,)
    .where("scenarios.owner_id", "=", userId,)
    .executeTakeFirst() ?? null;
}

/** Bump the touched scene (when present) and the scenario it belongs to. */
async function touchParents(
  database: Kysely<DB>,
  scenarioId: string,
  sceneId?: string | null,
): Promise<void> {
  const now = toDate().toISOString();
  if (sceneId) {
    await database
      .updateTable("scenario_scenes",)
      .set({ updated_at: now, },)
      .where("id", "=", sceneId,)
      .execute();
  }

  await database
    .updateTable("scenarios",)
    .set({ updated_at: now, },)
    .where("id", "=", scenarioId,)
    .execute();
}

/** @returns the rows for a reorder request, normalized to their parent ids */
async function reorderRows(
  database: Kysely<DB>,
  kind: ReorderKind,
  ids: string[],
  userId: string,
): Promise<ReorderRow[]> {
  if (ids.length === 0) { return []; }
  if (kind === "scene") {
    const rows = await database
      .selectFrom("scenario_scenes",)
      .innerJoin("scenarios", "scenarios.id", "scenario_scenes.scenario_id",)
      .select([
        "scenario_scenes.id as id",
        "scenario_scenes.scenario_id as scenarioId",
      ],)
      .where("scenario_scenes.id", "in", ids,)
      .where("scenarios.owner_id", "=", userId,)
      .execute();

    return rows.map((row,) => ({
      id: row.id,
      scenarioId: row.scenarioId,
      sceneId: null,
    }));
  }

  if (kind === "shot") {
    const rows = await database
      .selectFrom("scenario_shots",)
      .innerJoin("scenario_scenes", "scenario_scenes.id", "scenario_shots.scene_id",)
      .innerJoin("scenarios", "scenarios.id", "scenario_scenes.scenario_id",)
      .select([
        "scenario_shots.id as id",
        "scenario_scenes.id as sceneId",
        "scenarios.id as scenarioId",
      ],)
      .where("scenario_shots.id", "in", ids,)
      .where("scenarios.owner_id", "=", userId,)
      .execute();

    return rows.map((row,) => ({
      id: row.id,
      scenarioId: row.scenarioId,
      sceneId: row.sceneId,
    }));
  }

  const rows = await database
    .selectFrom("scenario_fragments",)
    .innerJoin("scenario_scenes", "scenario_scenes.id", "scenario_fragments.scene_id",)
    .innerJoin("scenarios", "scenarios.id", "scenario_scenes.scenario_id",)
    .select([
      "scenario_fragments.id as id",
      "scenario_scenes.id as sceneId",
      "scenarios.id as scenarioId",
    ],)
    .where("scenario_fragments.id", "in", ids,)
    .where("scenarios.owner_id", "=", userId,)
    .execute();

  return rows.map((row,) => ({
    id: row.id,
    scenarioId: row.scenarioId,
    sceneId: row.sceneId,
  }));
}

/**
 * @param opts - database handle
 * @param prefix - route prefix (defaults to `/api/v1`)
 * @returns Elysia plugin exposing the IVSS authoring endpoints
 */
export function ivssAuthoringRoutes(
  opts: { database: Kysely<DB> },
  prefix = "/api/v1",
) {
  const database = opts.database;
  const base = `${prefix}/ivss`;

  return new Elysia({ name: "ivss-authoring", },)
    // ── Scenarios ────────────────────────────────────────────
    .get(`${base}/scenarios`, async (ctx,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const rows = await database
        .selectFrom("scenarios",)
        .selectAll()
        .where("owner_id", "=", userId,)
        .orderBy("updated_at", "desc",)
        .execute();

      return jsonResponse(rows.map(scenarioSummary,),);
    },)
    .post(`${base}/scenarios`, async (ctx,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const { worldId, title, } = ctx.body;
      const worldErr = await requireWorldAccess(
        database,
        worldId,
        userId,
        extractAuth(ctx,).userRole,
      );

      if (worldErr) { return worldErr; }
      const now = toDate().toISOString();
      const id = crypto.randomUUID();
      await database
        .insertInto("scenarios",)
        .values({
          id,
          world_id: worldId,
          owner_id: userId,
          title,
          status: ScenarioStatus.Draft,
          created_at: now,
          updated_at: now,
        },)
        .execute();

      return jsonResponse({
        id,
        worldId,
        title,
        status: ScenarioStatus.Draft,
        updatedAt: iso(now,),
      }, HttpStatus.Created,);
    }, { body: scenarioBody, },)
    .get(`${base}/scenarios/:id`, async (ctx,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const scenario = await ownedScenario(database, ctx.params.id, userId,);
      if (!scenario) { return notFound(); }
      const scenes = await database.selectFrom("scenario_scenes",).selectAll()
        .where("scenario_id", "=", scenario.id,).orderBy("sort_order",).execute();

      const references = await database.selectFrom("scenario_references",).selectAll()
        .where("scenario_id", "=", scenario.id,).orderBy("sort_order",).execute();

      const docs = await database.selectFrom("scenario_docs",).selectAll()
        .where("scenario_id", "=", scenario.id,).orderBy("kind",).orderBy("version",).execute();

      const sceneIds = scenes.map((row,) => row.id);
      const shots = sceneIds.length === 0 ? [] : await database.selectFrom("scenario_shots",).selectAll()
        .where("scene_id", "in", sceneIds,).orderBy("sort_order",).execute();

      const fragments = sceneIds.length === 0 ? [] : await database.selectFrom("scenario_fragments",).selectAll()
        .where("scene_id", "in", sceneIds,).orderBy("sort_order",).execute();

      const shotsByScene = new Map<string, ShotRow[]>();
      const fragmentsByScene = new Map<string, FragmentRow[]>();
      for (const shot of shots) {
        const list = shotsByScene.get(shot.scene_id,) ?? [];
        list.push(shot,);
        shotsByScene.set(shot.scene_id, list,);
      }

      for (const fragment of fragments) {
        const list = fragmentsByScene.get(fragment.scene_id,) ?? [];
        list.push(fragment,);
        fragmentsByScene.set(fragment.scene_id, list,);
      }

      return jsonResponse({
        ...scenarioSummary(scenario,),
        createdAt: iso(scenario.created_at,),
        scenes: scenes.map((scene,) => ({
          ...sceneView(scene,),
          shots: (shotsByScene.get(scene.id,) ?? []).map(shotView,),
          fragments: (fragmentsByScene.get(scene.id,) ?? []).map(fragmentView,),
        })),
        references: references.map(referenceView,),
        docs: docs.map(docView,),
      },);
    }, { params: idParam, },)
    // ── Scenes ───────────────────────────────────────────────
    .post(`${base}/scenarios/:id/scenes`, async (ctx,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const scenario = await ownedScenario(database, ctx.params.id, userId,);
      if (!scenario) { return notFound(); }
      const body = ctx.body;
      if (!oneOf(SceneMode, body.mode,)) {
        return jsonError("Invalid scene mode", HttpStatus.BadRequest,);
      }

      const last = await database.selectFrom("scenario_scenes",).select("sort_order",)
        .where("scenario_id", "=", scenario.id,).orderBy("sort_order", "desc",).executeTakeFirst();

      const now = toDate().toISOString();
      const id = crypto.randomUUID();
      await database.insertInto("scenario_scenes",).values({
        id,
        scenario_id: scenario.id,
        sort_order: (last?.sort_order ?? -1) + 1,
        location_id: body.locationId ?? null,
        mode: body.mode,
        duration_frames: body.durationFrames,
        fps: body.fps,
        seed: body.seed ?? null,
        status: SceneStatus.Planned,
        created_at: now,
        updated_at: now,
      },).execute();

      await touchParents(database, scenario.id,);
      const row = await database.selectFrom("scenario_scenes",).selectAll()
        .where("id", "=", id,).executeTakeFirstOrThrow();

      return jsonResponse(sceneView(row,), HttpStatus.Created,);
    }, { params: idParam, body: sceneBody, },)
    .patch(`${base}/scenes/:id`, async (ctx,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const scene = await ownedScene(database, ctx.params.id, userId,);
      if (!scene) { return notFound(); }
      const body = ctx.body;
      const update: Partial<SceneRow> = { updated_at: toDate().toISOString(), };
      if (body.sortOrder !== undefined) { update.sort_order = body.sortOrder; }
      if (body.locationId !== undefined) { update.location_id = body.locationId; }
      if (body.durationFrames !== undefined) { update.duration_frames = body.durationFrames; }
      if (body.fps !== undefined) { update.fps = body.fps; }
      if (body.seed !== undefined) { update.seed = body.seed; }
      if (body.mode !== undefined) {
        if (!oneOf(SceneMode, body.mode,)) {
          return jsonError("Invalid scene mode", HttpStatus.BadRequest,);
        }

        update.mode = body.mode;
      }

      if (body.status !== undefined) {
        if (!oneOf(SceneStatus, body.status,)) {
          return jsonError("Invalid scene status", HttpStatus.BadRequest,);
        }

        update.status = body.status;
      }

      await database.updateTable("scenario_scenes",).set(update,)
        .where("id", "=", scene.id,).execute();

      await touchParents(database, scene.scenario_id,);
      const row = await database.selectFrom("scenario_scenes",).selectAll()
        .where("id", "=", scene.id,).executeTakeFirstOrThrow();

      return jsonResponse(sceneView(row,),);
    }, { params: idParam, body: scenePatch, },)
    .delete(`${base}/scenes/:id`, async (ctx,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const scene = await ownedScene(database, ctx.params.id, userId,);
      if (!scene) { return notFound(); }
      await database.deleteFrom("scenario_scenes",).where("id", "=", scene.id,).execute();
      await touchParents(database, scene.scenario_id,);
      return jsonResponse({ ok: true, },);
    }, { params: idParam, },)
    // ── Shots ────────────────────────────────────────────────
    .post(`${base}/scenes/:id/shots`, async (ctx,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const scene = await ownedScene(database, ctx.params.id, userId,);
      if (!scene) { return notFound(); }
      const body = ctx.body;
      if (body.endMs <= body.startMs) {
        return jsonError("endMs must be greater than startMs", HttpStatus.BadRequest,);
      }

      let cutType: CutType = CutType.HardCut;
      if (body.cutType !== undefined) {
        if (!oneOf(CutType, body.cutType,)) {
          return jsonError("Invalid cut type", HttpStatus.BadRequest,);
        }

        cutType = body.cutType;
      }

      const last = await database.selectFrom("scenario_shots",).select("sort_order",)
        .where("scene_id", "=", scene.id,).orderBy("sort_order", "desc",).executeTakeFirst();

      const id = crypto.randomUUID();
      await database.insertInto("scenario_shots",).values({
        id,
        scene_id: scene.id,
        sort_order: (last?.sort_order ?? -1) + 1,
        start_ms: body.startMs,
        end_ms: body.endMs,
        description: body.description,
        cut_type: cutType,
        camera_json: body.cameraJson ?? null,
        narration: body.narration ?? null,
      },).execute();

      await touchParents(database, scene.scenario_id, scene.id,);
      const row = await database.selectFrom("scenario_shots",).selectAll()
        .where("id", "=", id,).executeTakeFirstOrThrow();

      return jsonResponse(shotView(row,), HttpStatus.Created,);
    }, { params: idParam, body: shotBody, },)
    .patch(`${base}/shots/:id`, async (ctx,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const shot = await ownedShot(database, ctx.params.id, userId,);
      if (!shot) { return notFound(); }
      const body = ctx.body;
      const nextStart = body.startMs ?? shot.start_ms;
      const nextEnd = body.endMs ?? shot.end_ms;
      if (nextEnd <= nextStart) {
        return jsonError("endMs must be greater than startMs", HttpStatus.BadRequest,);
      }

      const update: Partial<ShotRow> = {};
      if (body.sortOrder !== undefined) { update.sort_order = body.sortOrder; }
      if (body.startMs !== undefined) { update.start_ms = body.startMs; }
      if (body.endMs !== undefined) { update.end_ms = body.endMs; }
      if (body.description !== undefined) { update.description = body.description; }
      if (body.cameraJson !== undefined) { update.camera_json = body.cameraJson; }
      if (body.narration !== undefined) { update.narration = body.narration; }
      if (body.cutType !== undefined) {
        if (!oneOf(CutType, body.cutType,)) {
          return jsonError("Invalid cut type", HttpStatus.BadRequest,);
        }

        update.cut_type = body.cutType;
      }

      await database.updateTable("scenario_shots",).set(update,)
        .where("id", "=", shot.id,).execute();

      await touchParents(database, shot.scenario_id, shot.scene_id,);
      const row = await database.selectFrom("scenario_shots",).selectAll()
        .where("id", "=", shot.id,).executeTakeFirstOrThrow();

      return jsonResponse(shotView(row,),);
    }, { params: idParam, body: shotPatch, },)
    .delete(`${base}/shots/:id`, async (ctx,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const shot = await ownedShot(database, ctx.params.id, userId,);
      if (!shot) { return notFound(); }
      await database.deleteFrom("scenario_shots",).where("id", "=", shot.id,).execute();
      await touchParents(database, shot.scenario_id, shot.scene_id,);
      return jsonResponse({ ok: true, },);
    }, { params: idParam, },)
    // ── Fragments ────────────────────────────────────────────
    .post(`${base}/scenes/:id/fragments`, async (ctx,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const scene = await ownedScene(database, ctx.params.id, userId,);
      if (!scene) { return notFound(); }
      const body = ctx.body;
      if (!oneOf(FragmentOperation, body.operation,)) {
        return jsonError("Invalid fragment operation", HttpStatus.BadRequest,);
      }

      let mode: SceneMode | null = null;
      if (body.mode != null) {
        if (!oneOf(SceneMode, body.mode,)) {
          return jsonError("Invalid fragment mode", HttpStatus.BadRequest,);
        }

        mode = body.mode;
      }

      let transition: CutType = CutType.HardCut;
      if (body.transition !== undefined) {
        if (!oneOf(CutType, body.transition,)) {
          return jsonError("Invalid transition", HttpStatus.BadRequest,);
        }

        transition = body.transition;
      }

      if (body.shotId != null) {
        const shot = await database.selectFrom("scenario_shots",).select("id",)
          .where("id", "=", body.shotId,).where("scene_id", "=", scene.id,).executeTakeFirst();

        if (!shot) {
          return jsonError("shotId does not belong to this scene", HttpStatus.BadRequest,);
        }
      }

      const last = await database.selectFrom("scenario_fragments",).select("sort_order",)
        .where("scene_id", "=", scene.id,).orderBy("sort_order", "desc",).executeTakeFirst();

      const now = toDate().toISOString();
      const id = crypto.randomUUID();
      await database.insertInto("scenario_fragments",).values({
        id,
        scene_id: scene.id,
        shot_id: body.shotId ?? null,
        sort_order: (last?.sort_order ?? -1) + 1,
        operation: body.operation,
        status: FragmentStatus.Planned,
        workflow_id: body.workflowId,
        workflow_hash: body.workflowHash,
        workflow_version: body.workflowVersion ?? null,
        node_versions: body.nodeVersions ?? null,
        mode,
        seed: body.seed ?? null,
        duration_frames: body.durationFrames ?? null,
        transition,
        prompt_snapshot: body.promptSnapshot ?? null,
        gallery_asset_id: body.galleryAssetId ?? null,
        caption: body.caption ?? null,
        input_assets: body.inputAssets ?? null,
        created_at: now,
        updated_at: now,
      },).execute();

      await touchParents(database, scene.scenario_id, scene.id,);
      const row = await database.selectFrom("scenario_fragments",).selectAll()
        .where("id", "=", id,).executeTakeFirstOrThrow();

      return jsonResponse(fragmentView(row,), HttpStatus.Created,);
    }, { params: idParam, body: fragmentBody, },)
    .patch(`${base}/fragments/:id`, async (ctx,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const fragment = await ownedFragment(database, ctx.params.id, userId,);
      if (!fragment) { return notFound(); }
      const raw = ctx.body as Record<string, unknown>;
      if (FORBIDDEN_FRAGMENT_PATCH.some((key,) => key in raw)) {
        return jsonError("Fragment status and output fields are read-only", HttpStatus.BadRequest,);
      }

      const body = ctx.body;
      const update: Partial<FragmentRow> = { updated_at: toDate().toISOString(), };
      if (body.sortOrder !== undefined) { update.sort_order = body.sortOrder; }
      if (body.promptSnapshot !== undefined) { update.prompt_snapshot = body.promptSnapshot; }
      if (body.galleryAssetId !== undefined) { update.gallery_asset_id = body.galleryAssetId; }
      if (body.caption !== undefined) { update.caption = body.caption; }
      if (body.inputAssets !== undefined) { update.input_assets = body.inputAssets; }
      if (body.cutInMs !== undefined) { update.cut_in_ms = body.cutInMs; }
      if (body.cutOutMs !== undefined) { update.cut_out_ms = body.cutOutMs; }
      if (body.seed !== undefined) { update.seed = body.seed; }
      if (body.durationFrames !== undefined) { update.duration_frames = body.durationFrames; }
      if (body.workflowId !== undefined) { update.workflow_id = body.workflowId; }
      if (body.workflowHash !== undefined) { update.workflow_hash = body.workflowHash; }
      if (body.workflowVersion !== undefined) { update.workflow_version = body.workflowVersion; }
      if (body.nodeVersions !== undefined) { update.node_versions = body.nodeVersions; }
      if (body.operation !== undefined) {
        if (!oneOf(FragmentOperation, body.operation,)) {
          return jsonError("Invalid fragment operation", HttpStatus.BadRequest,);
        }

        update.operation = body.operation;
      }

      if (body.mode !== undefined && body.mode !== null) {
        if (!oneOf(SceneMode, body.mode,)) {
          return jsonError("Invalid fragment mode", HttpStatus.BadRequest,);
        }

        update.mode = body.mode;
      } else if (body.mode === null) {
        update.mode = null;
      }

      if (body.transition !== undefined) {
        if (!oneOf(CutType, body.transition,)) {
          return jsonError("Invalid transition", HttpStatus.BadRequest,);
        }

        update.transition = body.transition;
      }

      await database.updateTable("scenario_fragments",).set(update,)
        .where("id", "=", fragment.id,).execute();

      await touchParents(database, fragment.scenario_id, fragment.scene_id,);
      const row = await database.selectFrom("scenario_fragments",).selectAll()
        .where("id", "=", fragment.id,).executeTakeFirstOrThrow();

      return jsonResponse(fragmentView(row,),);
    }, { params: idParam, body: fragmentPatch, },)
    .delete(`${base}/fragments/:id`, async (ctx,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const fragment = await ownedFragment(database, ctx.params.id, userId,);
      if (!fragment) { return notFound(); }
      await database.deleteFrom("scenario_fragments",).where("id", "=", fragment.id,).execute();
      await touchParents(database, fragment.scenario_id, fragment.scene_id,);
      return jsonResponse({ ok: true, },);
    }, { params: idParam, },)
    // ── Reorder ──────────────────────────────────────────────
    .post(`${base}/reorder`, async (ctx,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const { kind, ids, } = ctx.body;
      if (kind !== "scene" && kind !== "shot" && kind !== "fragment") {
        return jsonError("kind must be scene, shot or fragment", HttpStatus.BadRequest,);
      }

      if (new Set(ids,).size !== ids.length) {
        return jsonError("Duplicate ids in reorder request", HttpStatus.BadRequest,);
      }

      if (ids.length === 0) { return jsonResponse([],); }
      const rows = await reorderRows(database, kind, ids, userId,);
      if (rows.length !== ids.length) { return notFound(); }
      const parents = rows.map((row,) => kind === "scene" ? row.scenarioId : row.sceneId);
      if (new Set(parents,).size !== 1) {
        return jsonError("All ids must share one parent", HttpStatus.Conflict,);
      }

      await database.transaction().execute(async (tx,) => {
        for (let index = 0; index < ids.length; index++) {
          if (kind === "scene") {
            await tx.updateTable("scenario_scenes",).set({ sort_order: index, },)
              .where("id", "=", ids[index]!,).execute();
          } else if (kind === "shot") {
            await tx.updateTable("scenario_shots",).set({ sort_order: index, },)
              .where("id", "=", ids[index]!,).execute();
          } else {
            await tx.updateTable("scenario_fragments",).set({ sort_order: index, },)
              .where("id", "=", ids[index]!,).execute();
          }
        }
      },);

      await touchParents(database, rows[0]!.scenarioId, rows[0]!.sceneId,);
      return jsonResponse(ids.map((id, index,) => ({ id, sortOrder: index, })),);
    }, { body: reorderBody, },);
}
