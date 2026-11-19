// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
// size-allow: 320

/**
 * Workflow-driven fragment assembly — stitch completed IVSS clips through a
 * pinned ComfyUI workflow. No ffmpeg, no node-pack code, no service-boundary
 * crossing: the workflow is data and the shared asset services own storage.
 *
 * The ComfyUI client, workflow loader and dispatch gate are injected so CI can
 * drive the whole flow against a stub.
 */
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import { extensionForMime, mimeFromExtension, } from "../../assets/service/detect";
import { persistGeneratedImages, } from "../../assets/service/persist-generated";
import { getAssetData, getOwnedAsset, } from "../../assets/service/read";
import { AssetLinkEntity, } from "../../db/enums-content";
import { FragmentStatus, type ScenarioDocKind, } from "../../db/enums-generation";
import type { DB, } from "../../db/schema";
import { safeJsonStringify, } from "../../utils";
import { toDate, } from "../../utils/date";
import { VIDEO_QUEUE_WAIT_MS, } from "../video-dispatch-gate";
import { getWorkflowLoader, } from "../workflow-loader";
import type { IvssComfyClient, IvssRunDispatch, IvssWorkflowLoader, } from "./run-pipeline";

/** The doc kind is plain text in the DB; the enum has no assembly member yet. */
export const ASSEMBLY_DOC_KIND = "assembly" as ScenarioDocKind;

/** Options for {@link assembleScenario}. */
export interface AssembleScenarioOptions {
  database: Kysely<DB>;
  uploadDir: string;
  ownerId: string;
  scenarioId: string;
  client: IvssComfyClient;
  workflowId: string;
  workflowHash: string;
  workflowVersion?: string;
  loadWorkflow?: IvssWorkflowLoader;
  dispatch?: IvssRunDispatch;
  now?: () => number;
  timeoutMs?: number;
}

/** One completed clip's place on the assembly timeline. */
export interface AssemblyCutPoint {
  fragmentId: string;
  startMs: number;
  endMs: number;
  take: string;
}

export interface AssemblySuccess {
  ok: true;
  assemblyId: string;
  assetId: string;
  cutPoints: AssemblyCutPoint[];
}

export interface AssemblyFailure {
  ok: false;
  assemblyId: string;
  error: string;
  status: number;
}

export type AssemblyResult = AssemblySuccess | AssemblyFailure;

export interface AssemblyHandle {
  assemblyId: string;
  /** Settles once, success or failure; never rejects. */
  done: Promise<AssemblyResult>;
}

/** Error carrying the status the doc and result report. */
function assemblyError(message: string, status: number,): Error & { status: number } {
  const error = new Error(message,) as Error & { status: number };
  error.status = status;
  return error;
}

/**
 * Claim a scenario's completed fragments as a pending assembly doc, then stitch
 * them through the pinned workflow in the background.
 * @param opts - database, identity, client and injectable seams
 * @throws {Error} When the scenario is missing, unowned, or has no completed fragments
 * @returns handle whose `done` resolves to success or failure and never rejects
 */
export async function assembleScenario(
  opts: AssembleScenarioOptions,
): Promise<AssemblyHandle> {
  const db = opts.database;
  const now = opts.now ?? Date.now;
  const timestamp = () => toDate(now(),).toISOString();
  const timeoutMs = opts.timeoutMs ?? 300_000;
  const load: IvssWorkflowLoader = opts.loadWorkflow ??
    (async (name, vars,) => getWorkflowLoader().loadWorkflow({ name, vars, },));

  const scenario = await db.selectFrom("scenarios",).select(["id", "world_id", "owner_id",],)
    .where("id", "=", opts.scenarioId,).executeTakeFirst();

  if (!scenario) { throw assemblyError(`scenario ${opts.scenarioId} not found`, 404,); }
  if (scenario.owner_id !== opts.ownerId) {
    throw assemblyError(`scenario ${opts.scenarioId} is not owned by the caller`, 403,);
  }

  const scenes = await db.selectFrom("scenario_scenes",)
    .select(["id", "fps", "duration_frames", "sort_order",],)
    .where("scenario_id", "=", scenario.id,).orderBy("sort_order",).execute();

  const sceneOrder = new Map(scenes.map((scene, index,) => [scene.id, index,]),);
  const sceneById = new Map(scenes.map((scene,) => [scene.id, scene,]),);

  const fragments = scenes.length === 0 ? [] : await db.selectFrom("scenario_fragments",).selectAll()
    .where("scene_id", "in", scenes.map((scene,) => scene.id),)
    .where("status", "=", FragmentStatus.Completed,)
    .where("output_asset_id", "is not", null,)
    .execute();

  fragments.sort((a, b,) =>
    (sceneOrder.get(a.scene_id,)! - sceneOrder.get(b.scene_id,)!) || (a.sort_order - b.sort_order)
  );

  if (fragments.length === 0) {
    throw assemblyError(`scenario ${opts.scenarioId} has no completed fragments`, 409,);
  }

  const fps = sceneById.get(fragments[0]!.scene_id,)!.fps;
  const cutPoints: AssemblyCutPoint[] = fragments.map((fragment,) => {
    const startMs = fragment.cut_in_ms;
    const durationFrames = fragment.duration_frames ??
      sceneById.get(fragment.scene_id,)!.duration_frames;

    return {
      fragmentId: fragment.id,
      startMs,
      endMs: fragment.cut_out_ms ?? startMs + (durationFrames / sceneById.get(fragment.scene_id,)!.fps) * 1000,
      take: fragment.take,
    };
  },);

  const fragmentIds = fragments.map((fragment,) => fragment.id);

  const previous = await db.selectFrom("scenario_docs",).select("version",)
    .where("scenario_id", "=", scenario.id,).where("kind", "=", ASSEMBLY_DOC_KIND,)
    .orderBy("version", "desc",).executeTakeFirst();

  const version = (previous?.version ?? 0) + 1;
  const assemblyId = randomUUID();
  // ponytail: one assembly doc per scenario; history needs its own table.
  await db.deleteFrom("scenario_docs",)
    .where("scenario_id", "=", scenario.id,).where("kind", "=", ASSEMBLY_DOC_KIND,)
    .execute();

  /**
   * @param body - assembly manifest payload
   * @throws {Error} When the manifest cannot be serialized
   */
  const encode = (body: unknown,): string => {
    const encoded = safeJsonStringify(body,);
    if (!encoded.ok) { throw new Error("IVSS assembly manifest could not be serialized",); }
    return encoded.value;
  };

  const pendingBody = {
    status: "pending",
    workflowId: opts.workflowId,
    workflowHash: opts.workflowHash,
    workflowVersion: opts.workflowVersion,
    fragmentIds,
    cutPoints,
  };

  await db.insertInto("scenario_docs",).values({
    id: assemblyId,
    scenario_id: scenario.id,
    kind: ASSEMBLY_DOC_KIND,
    title: null,
    body: encode(pendingBody,),
    version,
    created_at: timestamp(),
    updated_at: timestamp(),
  },).execute();

  const updateDoc = async (body: unknown, docVersion: number,): Promise<void> => {
    await db.updateTable("scenario_docs",).set({
      body: encode(body,),
      version: docVersion,
      updated_at: timestamp(),
    },).where("id", "=", assemblyId,).execute();
  };

  const uploadClips = async (): Promise<string[]> => {
    const uploads: string[] = [];
    for (const fragment of fragments) {
      const assetRef = fragment.output_asset_id!;
      const asset = await getOwnedAsset(db, assetRef, opts.ownerId,);
      if (!asset) {
        throw assemblyError(`fragment ${fragment.id} output asset is not accessible`, 403,);
      }

      const buffer = await getAssetData(db, assetRef, opts.uploadDir,);
      if (!buffer) {
        throw assemblyError(`fragment ${fragment.id} output data is missing`, 404,);
      }

      uploads.push(await opts.client.uploadImage(buffer, `fragment-${fragment.id}-${asset.filename}`,),);
    }

    return uploads;
  };

  const markFailed = async (message: string,): Promise<void> => {
    try {
      await updateDoc({ status: "failed", error: message, }, version,);
    } catch {
      // Best effort: an unreachable DB cannot be told about its own failure.
    }
  };

  const run = async (): Promise<AssemblyResult> => {
    let assetId: string | undefined;
    const render = async () => {
      const uploads = await uploadClips();

      const clipVars: Record<string, string | number | boolean> = {
        fragment_count: fragments.length,
        cut_points: encode(cutPoints,),
        fps,
        scenario_id: scenario.id,
      };

      uploads.forEach((name, index,) => {
        clipVars[`clip_${index + 1}`] = name;
      },);

      const workflow = await load(opts.workflowId, clipVars,);
      const submitted = await opts.client.submitWorkflow(workflow,);
      const refs = await opts.client.waitForFiles(submitted.prompt_id, timeoutMs,);
      const clipRef = refs.find((ref,) => ref.kind === "video");
      if (!clipRef) { throw new Error("ComfyUI workflow produced no video output",); }
      const clipBuffer = await opts.client.downloadFile(clipRef.file,);
      const mimeType = mimeFromExtension(clipRef.file.filename,);
      const extension = extensionForMime(mimeType,);
      const [persisted,] = await persistGeneratedImages({
        database: db,
        uploadDir: opts.uploadDir,
        images: [clipBuffer,],
        mimeType,
        ownerId: opts.ownerId,
        altText: `IVSS assembly ${assemblyId}`,
        links: [{ entityType: AssetLinkEntity.World, entityId: scenario.world_id, label: "ivss", },],
        assetType: "video",
        makeFilename: () => `assembly-${assemblyId}.${extension}`,
      },);

      const asset = persisted?.asset;
      if (!asset) { throw new Error("IVSS assembly video persistence failed",); }

      await updateDoc({
        status: "completed",
        assetId: asset.id,
        workflowId: opts.workflowId,
        workflowHash: opts.workflowHash,
        workflowVersion: opts.workflowVersion,
        fragmentIds,
        cutPoints,
      }, version,);

      assetId = asset.id;
    };

    try {
      if (opts.dispatch) {
        await opts.dispatch({ providers: [], queueWaitMs: VIDEO_QUEUE_WAIT_MS, now, run: render, },);
      } else {
        await render();
      }

      if (!assetId) { throw new Error("IVSS assembly settled without an asset",); }
      return { ok: true, assemblyId, assetId, cutPoints, };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error,);
      const status = (error as { status?: number }).status ?? 502;
      await markFailed(message,);
      return { ok: false, assemblyId, error: message, status, };
    }
  };

  return { assemblyId, done: run(), };
}
