// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
// size-allow: 320

/**
 * IVSS fragment run pipeline — one render fragment through local ComfyUI.
 *
 * The ComfyUI client, workflow loader and dispatch gate are injected so CI can
 * drive the whole flow against a stub. Nothing here edits node code or assumes
 * a particular node pack: the fragment pins the workflow, the shot grammar
 * supplies the variables, and the shared asset/job services own persistence.
 */
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import { extensionForMime, mimeFromExtension, } from "../../assets/service/detect";
import { persistGeneratedImages, } from "../../assets/service/persist-generated";
import type { VideoProviderConfig, } from "../../config/schema";
import { AssetType, } from "../../db/enums";
import { AssetLinkEntity, } from "../../db/enums-content";
import { FragmentStatus, SceneStatus, } from "../../db/enums-generation";
import type { DB, } from "../../db/schema";
import { getChildLogger, } from "../../logger";
import { safeJsonStringify, } from "../../utils";
import { toDate, } from "../../utils/date";
import type { ComfyUIOutputFile, ComfyUIOutputKind, ComfyUIWorkflow, } from "../providers/comfyui";
import type { ComfyUIMaskOriginalRef, } from "../providers/comfyui-upload";
import { dispatchThroughVideoGate, VIDEO_QUEUE_WAIT_MS, type VideoGateDispatchOptions, } from "../video-dispatch-gate";
import { cancelVideoJob, completeVideoJob, failVideoJob, storeVideoJob, } from "../video-jobs";
import { getWorkflowLoader, } from "../workflow-loader";
import { uploadIvssReferences, } from "./reference-upload";
import { compileShotGrammar, } from "./shot-grammar";

/** Subset of `ComfyUIClient` the pipeline needs; the real client satisfies it. */
export interface IvssComfyClient {
  submitWorkflow(workflow: ComfyUIWorkflow,): Promise<{ prompt_id: string }>;
  waitForFiles(promptId: string,): Promise<Array<{ kind: ComfyUIOutputKind; file: ComfyUIOutputFile }>>;
  downloadFile(file: ComfyUIOutputFile,): Promise<Buffer>;
  cancelExecution(promptId?: string,): Promise<void>;
  uploadImage(buffer: Buffer, filename: string,): Promise<string>;
  uploadMask?(buffer: Buffer, filename: string, originalRef: ComfyUIMaskOriginalRef,): Promise<string>;
}

/** Resolve a pinned workflow name plus the shot-grammar variables to a graph. */
export type IvssWorkflowLoader = (
  name: string,
  vars: Record<string, string | number | boolean>,
) => Promise<ComfyUIWorkflow>;

/** Per-box gate seam; production uses `dispatchThroughVideoGate`. */
export type IvssRunDispatch = (opts: VideoGateDispatchOptions,) => Promise<void>;

export interface StartIvssFragmentRunOptions {
  database: Kysely<DB>;
  uploadDir: string;
  ownerId: string;
  fragmentId: string;
  client: IvssComfyClient;
  providers?: VideoProviderConfig[];
  loadWorkflow?: IvssWorkflowLoader;
  dispatch?: IvssRunDispatch;
  now?: () => number;
  queueWaitMs?: number;
  /** Render deadline used by the tracked job; default 5 minutes. */
  timeoutMs?: number;
  maxPromptTokens?: number;
}

export interface IvssRunSuccess {
  ok: true;
  jobId: string;
  fragmentId: string;
  promptId: string;
  assetId: string;
  filename: string;
  mimeType: string;
  latentAssetId?: string;
  truncated: string[];
}

export interface IvssRunFailure {
  ok: false;
  jobId: string;
  fragmentId: string;
  error: string;
  status: number;
}

export type IvssRunResult = IvssRunSuccess | IvssRunFailure;

export interface IvssRunHandle {
  jobId: string;
  fragmentId: string;
  /** Settles once, success or failure; never rejects after the claim succeeds. */
  done: Promise<IvssRunResult>;
  cancel(): Promise<void>;
}

/** H3 checkpoints and latent packages land in non-video output buckets. */
const LATENT_FILE_RE = /\.(latent|safetensors)$/i;

function cancellation(): Error & { status: number } {
  const error = new Error("IVSS run cancelled",) as Error & { status: number };
  error.status = 499;
  return error;
}

/**
 * Claim a fragment, register its job, and start the render.
 * @param opts - database, identity, client and injectable render seams
 * @throws {Error} When the fragment is missing or already claimed
 * @returns handle with a settled `done` promise and an idempotent `cancel`
 */
export async function startIvssFragmentRun(
  opts: StartIvssFragmentRunOptions,
): Promise<IvssRunHandle> {
  const log = getChildLogger("ivss-run",);
  const db = opts.database;
  const now = opts.now ?? Date.now;
  const timestamp = () => toDate(now(),).toISOString();
  const providers = opts.providers ?? [];
  const timeoutMs = opts.timeoutMs ?? 300_000;
  const dispatch = opts.dispatch ?? dispatchThroughVideoGate;
  const load = opts.loadWorkflow ??
    (async (name, vars,): Promise<ComfyUIWorkflow> => getWorkflowLoader().loadWorkflow({ name, vars, },));

  const fragment = await db.selectFrom("scenario_fragments",).selectAll()
    .where("id", "=", opts.fragmentId,).executeTakeFirstOrThrow();

  const scene = await db.selectFrom("scenario_scenes",).selectAll()
    .where("id", "=", fragment.scene_id,).executeTakeFirstOrThrow();

  const scenario = await db.selectFrom("scenarios",).select(["id", "world_id",],)
    .where("id", "=", scene.scenario_id,).executeTakeFirstOrThrow();

  const shots = await db.selectFrom("scenario_shots",).selectAll()
    .where("scene_id", "=", scene.id,).orderBy("sort_order",).execute();

  const seed = fragment.seed ?? scene.seed ?? "";
  const compiled = compileShotGrammar({
    scene: { id: scene.id, mode: scene.mode, fps: scene.fps, seed, },
    shots,
  }, opts.maxPromptTokens === undefined ? {} : { maxTokens: opts.maxPromptTokens, },);

  // CAS claim: a queued/running/completed fragment is never submitted twice.
  const claimed = await db.updateTable("scenario_fragments",).set({
    status: FragmentStatus.Queued,
    prompt_snapshot: compiled.prompt,
    seed,
    duration_frames: compiled.variables.duration_frames,
    error: null,
    updated_at: timestamp(),
  },).where("id", "=", fragment.id,)
    .where("status", "in", [FragmentStatus.Planned, FragmentStatus.Failed,],)
    .executeTakeFirst();

  if (Number(claimed?.numUpdatedRows ?? 0,) === 0) {
    throw new Error(`fragment ${fragment.id} is not runnable`,);
  }

  const jobId = randomUUID();
  storeVideoJob({
    id: jobId,
    ownerId: opts.ownerId,
    status: "pending",
    request: { prompt: compiled.prompt, },
    providers: [...providers,],
    deadline: now() + timeoutMs,
    createdAt: now(),
  },);

  let cancelled = false;
  let promptId: string | undefined;
  let notifyCancel: (() => void) | undefined;
  const cancelSignal = new Promise<void>((resolve,) => {
    notifyCancel = resolve;
  },);

  const run = async (): Promise<IvssRunResult> => {
    let settled: IvssRunSuccess | undefined;
    try {
      await dispatch({
        providers,
        queueWaitMs: opts.queueWaitMs ?? VIDEO_QUEUE_WAIT_MS,
        run: async () => {
          if (cancelled) { throw cancellation(); }
          await db.updateTable("scenario_fragments",).set({
            status: FragmentStatus.Running,
            updated_at: timestamp(),
          },).where("id", "=", fragment.id,).execute();

          const slots = await uploadIvssReferences({
            database: db,
            uploadDir: opts.uploadDir,
            ownerId: opts.ownerId,
            scenarioId: scenario.id,
            sceneId: scene.id,
            shotId: fragment.shot_id,
            client: opts.client,
          },);

          const encodedSlots = safeJsonStringify(slots,);
          if (!encodedSlots.ok) { throw new Error("IVSS reference slots could not be serialized",); }

          const variables = { ...compiled.variables, reference_slots: encodedSlots.value, };

          const workflow = await load(fragment.workflow_id, variables,);

          const submitted = await opts.client.submitWorkflow(workflow,);
          promptId = submitted.prompt_id;

          const raced = await Promise.race([
            opts.client.waitForFiles(promptId,).then((files,) => ({ files, })),
            cancelSignal.then(() => ({ cancelled: true as const, })),
          ],);

          if ("cancelled" in raced) { throw cancellation(); }
          if (cancelled) { throw cancellation(); }
          const refs = raced.files;

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
            altText: `IVSS fragment ${fragment.id}`,
            links: [{ entityType: AssetLinkEntity.World, entityId: scenario.world_id, label: "ivss", },],
            assetType: "video",
            makeFilename: () => `${fragment.id}-${jobId}.${extension}`,
          },);

          const asset = persisted?.asset;
          if (!asset) { throw new Error("IVSS video asset persistence failed",); }

          let latentAssetId: string | undefined;
          const latentRef = refs.find((ref,) => LATENT_FILE_RE.test(ref.file.filename,));
          if (latentRef) {
            const latentBuffer = await opts.client.downloadFile(latentRef.file,);
            const [latentPersisted,] = await persistGeneratedImages({
              database: db,
              uploadDir: opts.uploadDir,
              images: [latentBuffer,],
              mimeType: "application/octet-stream",
              ownerId: opts.ownerId,
              altText: `IVSS latent ${fragment.id}`,
              links: [],
              assetType: AssetType.Other,
              makeFilename: () => `${fragment.id}-${jobId}.latent`,
            },);

            latentAssetId = latentPersisted?.asset.id;
          }

          await db.updateTable("scenario_fragments",).set({
            status: FragmentStatus.Completed,
            output_asset_id: asset.id,
            latent_asset_id: latentAssetId ?? null,
            updated_at: timestamp(),
          },).where("id", "=", fragment.id,).execute();

          await db.updateTable("scenario_scenes",).set({
            status: SceneStatus.Ready,
            generated_asset_id: asset.id,
            updated_at: timestamp(),
          },).where("id", "=", scene.id,).execute();

          settled = {
            ok: true,
            jobId,
            fragmentId: fragment.id,
            promptId: promptId!,
            assetId: asset.id,
            filename: asset.filename,
            mimeType: asset.mime_type,
            latentAssetId,
            truncated: compiled.truncated,
          };
        },
      },);

      if (!settled) { throw new Error("IVSS render settled without an outcome",); }
      completeVideoJob(jobId, {
        id: settled.assetId,
        url: `/api/v1/assets/${settled.assetId}/raw`,
        filename: settled.filename,
        mimeType: settled.mimeType,
        provider: `comfyui:${fragment.workflow_id}`,
      },);

      return settled;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error,);
      const status = (error as { status?: number }).status ?? 502;
      log?.warn("IVSS fragment run failed", {
        fragmentId: fragment.id,
        jobId,
        status,
        message,
      },);

      failVideoJob(jobId, message, status,);
      await db.updateTable("scenario_fragments",).set({
        status: cancelled ? FragmentStatus.Cancelled : FragmentStatus.Failed,
        error: message,
        updated_at: timestamp(),
      },).where("id", "=", fragment.id,).execute();

      await db.updateTable("scenario_scenes",).set({
        status: SceneStatus.Failed,
        updated_at: timestamp(),
      },).where("id", "=", scene.id,).execute();

      return { ok: false, jobId, fragmentId: fragment.id, error: message, status, };
    }
  };

  return {
    jobId,
    fragmentId: fragment.id,
    done: run(),
    cancel: async () => {
      if (cancelled) { return; }
      cancelled = true;
      notifyCancel?.();
      if (promptId) {
        try {
          await opts.client.cancelExecution(promptId,);
        } catch (error) {
          log?.warn("IVSS ComfyUI cancel failed", {
            promptId,
            error: error instanceof Error ? error.message : String(error,),
          },);
        }
      }

      cancelVideoJob(jobId, "IVSS run cancelled",);
      await db.updateTable("scenario_fragments",).set({
        status: FragmentStatus.Cancelled,
        error: "cancelled",
        updated_at: timestamp(),
      },).where("id", "=", fragment.id,).execute();
    },
  };
}
