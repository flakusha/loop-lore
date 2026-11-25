// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
// One fragment-run pipeline; types stay with the pipeline they describe.
// size-allow: 510

/**
 * IVSS fragment run pipeline — one render fragment through local ComfyUI.
 *
 * The ComfyUI client, workflow loader and dispatch gate are injected so CI can
 * drive the whole flow against a stub. Nothing here edits node code or assumes
 * a particular node pack: the fragment pins the workflow, the shot grammar
 * supplies the variables, and the shared asset/job services own persistence.
 */
import type { Kysely, } from "kysely";
import { createHash, randomUUID, } from "node:crypto";
import { extensionForMime, mimeFromExtension, } from "../../assets/service/detect";
import { persistGeneratedImages, } from "../../assets/service/persist-generated";
import type { VideoProviderConfig, } from "../../config/schema";
import { AssetType, } from "../../db/enums";
import { AssetLinkEntity, } from "../../db/enums-content";
import { FragmentStatus, SceneStatus, } from "../../db/enums-generation";
import type { DB, } from "../../db/schema";
import { canonicalJSON, } from "../../hash/record-hash";
import { getChildLogger, type Logger, } from "../../logger";
import { safeJsonStringify, } from "../../utils";
import { toDate, } from "../../utils/date";
import { cachedDiscovery, } from "../discovery-cache";
import type { ComfyUINodeInfo, ComfyUIOutputFile, ComfyUIOutputKind, ComfyUIWorkflow, } from "../providers/comfyui";
import { pickVideoSink, } from "../providers/comfyui-poll";
import type { ComfyUIMaskOriginalRef, } from "../providers/comfyui-upload";
import { dispatchThroughVideoGate, VIDEO_QUEUE_WAIT_MS, type VideoGateDispatchOptions, } from "../video-dispatch-gate";
import { cancelVideoJob, completeVideoJob, failVideoJob, getVideoJob, storeVideoJob, } from "../video-jobs";
import { getWorkflowLoader, } from "../workflow-loader";
import { hasTerminalSink, } from "../workflow-loader/workflow-validation";
import { uploadIvssReferences, } from "./reference-upload";
import { resolveRetakeLatent, } from "./retake";
import { compileShotGrammar, } from "./shot-grammar";

/** Subset of `ComfyUIClient` the pipeline needs; the real client satisfies it. */
export interface IvssComfyClient {
  submitWorkflow(workflow: ComfyUIWorkflow,): Promise<{ prompt_id: string }>;
  /**
   * Wait for the workflow's output files.
   * Implementations must honor `timeoutMs` as the poll deadline when given,
   * so the tracked job deadline and the poll deadline cannot diverge.
   */
  waitForFiles(
    promptId: string,
    timeoutMs?: number,
  ): Promise<Array<{ kind: ComfyUIOutputKind; file: ComfyUIOutputFile }>>;
  downloadFile(file: ComfyUIOutputFile,): Promise<Buffer>;
  cancelExecution(promptId?: string,): Promise<void>;
  uploadImage(buffer: Buffer, filename: string,): Promise<string>;
  uploadMask?(buffer: Buffer, filename: string, originalRef: ComfyUIMaskOriginalRef,): Promise<string>;
  /** `/object_info` snapshot; the real client implements it, stubs may omit it. */
  getNodeInfo?(): Promise<Record<string, ComfyUINodeInfo>>;
}

/** Resolve a pinned workflow name plus the shot-grammar variables to a graph. */
export type IvssWorkflowLoader = (
  name: string,
  vars: Record<string, string | number | boolean>,
) => Promise<ComfyUIWorkflow>;

/** Per-box gate seam; production uses `dispatchThroughVideoGate`. */
export type IvssRunDispatch = (opts: VideoGateDispatchOptions,) => Promise<void>;

/** What the renderer needs to decide whether honkbox can take a fragment. */
export interface IvssHonkboxOffloadRequest {
  readonly fragmentId: string;
  readonly workflowId: string;
  readonly prompt: string;
}

/** A honkbox adapter returns a client with the same render seam as ComfyUI. */
export type IvssHonkboxOffloadDecision =
  | { ok: true; client: IvssComfyClient }
  | { ok: false; reason: string };

export type IvssHonkboxOffload = (
  request: IvssHonkboxOffloadRequest,
) => Promise<IvssHonkboxOffloadDecision>;

/** Raised when honkbox offload is selected but no video job route is available. */
export class HonkboxVideoOffloadError extends Error {
  constructor(message: string,) {
    super(message,);
    this.name = "HonkboxVideoOffloadError";
  }
}

/**
 * Landed honkbox capabilities advertise no video job route, so the default
 * offload adapter fails closed instead of pretending to render.
 */
export const stubHonkboxVideoOffload: IvssHonkboxOffload = async () => ({
  ok: false,
  reason: "honkbox has no video job route in the landed contract; live offload is unavailable",
});

export interface StartIvssFragmentRunOptions {
  database: Kysely<DB>;
  uploadDir: string;
  ownerId: string;
  fragmentId: string;
  client: IvssComfyClient;
  /** Backend for this render; honkbox is fail-closed until a video job route exists. */
  videoBackend?: "comfyui" | "honkbox";
  /** Consulted only when `videoBackend` is "honkbox". */
  honkboxOffload?: IvssHonkboxOffload;
  providers?: VideoProviderConfig[];
  loadWorkflow?: IvssWorkflowLoader;
  dispatch?: IvssRunDispatch;
  now?: () => number;
  queueWaitMs?: number;
  /** Render deadline used by the tracked job; default 5 minutes. */
  timeoutMs?: number;
  maxPromptTokens?: number;
  /** Parent fragment whose latent package seeds this render (retake/resume). */
  resumeFromFragmentId?: string;
  /** Optional signed URL resolver for a remote ComfyUI latent source. */
  assetUrl?: (assetId: string,) => Promise<string>;
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
  /** Take label of the parent when this render resumed from a latent. */
  resumedFromTake?: string;
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

/**
 * Fail a fragment whose pinned workflow cannot render. The shipped H3
 * fragment JSONs are Note-only placeholders; refuse before submit with the
 * exact fix instead of surfacing a late loader error.
 * @param workflowId - pinned workflow name
 * @param detail - loader error, when the graph never resolved
 * @returns an Error carrying an actionable 422 status
 */
function fragmentWorkflowError(workflowId: string, detail?: string,): Error & { status: number } {
  const error = new Error(
    `Fragment workflow "${workflowId}" has no terminal sink (${detail ?? "loaded graph has no output node"}). ` +
      "The shipped MiniMax H3 fragment JSONs are Note-only placeholders: replace configs/workflows/" +
      `${workflowId}.json with a real ComfyUI API-format graph ending in a video sink ` +
      "(SaveVideo / VHS_VideoCombine / DaSiWa_EnhancedVideoCombine) plus a latent package sink, then retry.",
  ) as Error & { status: number };

  error.status = 422;
  return error;
}

function cancellation(): Error & { status: number } {
  const error = new Error("IVSS run cancelled",) as Error & { status: number };
  error.status = 499;
  return error;
}

/**
 * Stable stamp over the discovered `/object_info` snapshot. A changed node
 * pack or model list changes the hash, so the fragment records which
 * installed nodes rendered it.
 */
function nodeVersionsStamp(info: Record<string, ComfyUINodeInfo>,): string | null {
  const digest = createHash("sha256",).update(canonicalJSON(info,),).digest("hex",);
  const encoded = safeJsonStringify({ object_info_sha256: digest, },);
  return encoded.ok ? encoded.value : null;
}

/** Deadline failure for a run whose absolute wall-clock budget expired. */
function deadlineExceeded(): Error & { status: number } {
  const error = new Error("IVSS fragment run deadline exceeded",) as Error & { status: number };
  error.status = 504;
  return error;
}

/**
 * Discover and hash the installed node snapshot. Fail-open: an unreachable
 * ComfyUI leaves the stamp null rather than blocking the render.
 * @param client - render client; may omit the `/object_info` seam
 * @param baseUrl - cache key discriminator for the backend
 * @param log - optional structured log sink
 * @returns stable JSON stamp, or null when discovery is unavailable
 */
async function discoverNodeVersions(
  client: IvssComfyClient,
  baseUrl: string,
  log: Logger | null,
): Promise<string | null> {
  if (!client.getNodeInfo) { return null; }
  try {
    const info = await cachedDiscovery<Record<string, ComfyUINodeInfo> | undefined>(
      "ivss:node-versions:" + baseUrl,
      async () => client.getNodeInfo?.(),
      { shouldCache: (value,) => value !== undefined, },
    );

    return info ? nodeVersionsStamp(info,) : null;
  } catch (error) {
    log?.warn("IVSS node version discovery failed", {
      error: error instanceof Error ? error.message : String(error,),
    },);

    return null;
  }
}

/**
 * Claim a fragment, register its job, and start the render.
 * @param opts - database, identity, client and injectable render seams
 * @throws {HonkboxVideoOffloadError} When honkbox offload has no video job route
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
  // Absolute wall-clock budget from run start; the poll's own timer starts
  // later, after upload/load, so it cannot be the only deadline.
  const absoluteDeadline = now() + timeoutMs;
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

  const retake = opts.resumeFromFragmentId
    ? await resolveRetakeLatent({
      database: db,
      uploadDir: opts.uploadDir,
      ownerId: opts.ownerId,
      fragment,
      resumeFromFragmentId: opts.resumeFromFragmentId,
      ...(opts.assetUrl ? { assetUrl: opts.assetUrl, } : {}),
    },)
    : undefined;

  const retakeInputs = retake
    ? safeJsonStringify({ latent: retake.assetId, parent_fragment: opts.resumeFromFragmentId, },)
    : undefined;

  if (retake && (!retakeInputs?.ok)) {
    throw new Error("IVSS retake inputs could not be serialized",);
  }

  const backend = opts.videoBackend ?? "comfyui";
  let renderClient = opts.client;
  if (backend === "honkbox") {
    const decision = await (opts.honkboxOffload ?? stubHonkboxVideoOffload)({
      fragmentId: fragment.id,
      workflowId: fragment.workflow_id,
      prompt: compiled.prompt,
    },);

    if (!decision.ok) { throw new HonkboxVideoOffloadError(decision.reason,); }
    renderClient = decision.client;
  }

  // The shared cache keeps discovery to one /object_info fetch per backend.
  const nodeVersions = await discoverNodeVersions(
    renderClient,
    providers[0]?.baseUrl ?? "default",
    log,
  );

  // CAS claim: a queued/running/completed fragment is never submitted twice.
  const claimed = await db.updateTable("scenario_fragments",).set({
    status: FragmentStatus.Queued,
    node_versions: nodeVersions,
    prompt_snapshot: compiled.prompt,
    seed,
    duration_frames: compiled.variables.duration_frames,
    error: null,
    ...(retakeInputs?.ok ? { input_assets: retakeInputs.value, } : {}),
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
    deadline: absoluteDeadline,
    createdAt: now(),
    // IVSS has no deferral entry point: its render starts inside this call.
    started: true,
  },);

  let cancelled = false;
  let promptId: string | undefined;
  let notifyCancel: (() => void) | undefined;
  /** Cancel-before-submit and raced-cancel both funnel here; never twice. */
  let remoteCancelStarted = false;
  const tryCancelRemote = (): Promise<void> => {
    if (!promptId || remoteCancelStarted) { return Promise.resolve(); }
    remoteCancelStarted = true;
    return renderClient.cancelExecution(promptId,).catch((error,) => {
      log?.warn("IVSS ComfyUI cancel failed", {
        promptId,
        error: error instanceof Error ? error.message : String(error,),
      },);
    },);
  };

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
            client: renderClient,
          },);

          const encodedSlots = safeJsonStringify(slots,);
          if (!encodedSlots.ok) { throw new Error("IVSS reference slots could not be serialized",); }

          const variables = {
            ...compiled.variables,
            reference_slots: encodedSlots.value,
            ...(retake
              ? {
                latent_path: retake.path,
                ...(retake.url ? { latent_url: retake.url, } : {}),
                latent_asset_id: retake.assetId,
                resume_from_take: retake.parentTake,
              }
              : {}),
          };

          let workflow: ComfyUIWorkflow;
          try {
            workflow = await load(fragment.workflow_id, variables,);
          } catch (error) {
            throw fragmentWorkflowError(
              fragment.workflow_id,
              error instanceof Error ? error.message : String(error,),
            );
          }

          if (!hasTerminalSink(workflow,)) { throw fragmentWorkflowError(fragment.workflow_id,); }

          // Cancel during upload/load must win before the prompt is submitted.
          if (cancelled) { throw cancellation(); }

          const submitted = await renderClient.submitWorkflow(workflow,);
          promptId = submitted.prompt_id;

          const remainingMs = Math.max(0, absoluteDeadline - now(),);
          if (remainingMs === 0) {
            await tryCancelRemote();
            throw deadlineExceeded();
          }

          let clearDeadlineTimer: (() => void) | undefined;
          const deadlineSignal = new Promise<{ deadline: true }>((resolve,) => {
            const timer = setTimeout(() => resolve({ deadline: true, },), remainingMs,);
            clearDeadlineTimer = () => clearTimeout(timer,);
          },);

          const raced = await Promise.race([
            renderClient.waitForFiles(promptId, timeoutMs,).then((files,) => ({ files, })),
            cancelSignal.then(() => ({ cancelled: true as const, })),
            deadlineSignal,
          ],).finally(() => clearDeadlineTimer?.());

          if ("deadline" in raced) {
            await tryCancelRemote();
            throw deadlineExceeded();
          }

          if ("cancelled" in raced) {
            // Submitted before cancel landed: stop the remote render.
            await tryCancelRemote();
            throw cancellation();
          }

          if (cancelled) { throw cancellation(); }
          // The poll can resolve just under its own timer while upload/load
          // already consumed the budget — fail instead of persisting past it.
          if (now() >= absoluteDeadline) {
            await tryCancelRemote();
            throw deadlineExceeded();
          }

          const refs = raced.files;

          const latentRef = refs.find((ref,) => LATENT_FILE_RE.test(ref.file.filename,));

          // H2 mitigation (loud failure, not a silent null): every fragment
          // operation depends on the latent package for resume/retake, and
          // the fragment schema pins only workflow_id/hash — no opt-out
          // exists, so a missing latent fails the run unconditionally with a
          // named error before any asset is persisted. The gate is now the
          // safety net only: package_path capture (operator option (b),
          // 2026-11-19) serves a MiniMaxH3LQPackageSave package via GET
          // /view, and files-bucket entries are captured as before. The gate
          // fires only when the graph produced neither source.
          if (!latentRef) {
            const error = new Error(
              `latent_not_captured: fragment workflow ${fragment.workflow_id} completed without a captured latent package (.latent/.safetensors); ` +
                "the graph produced neither a files-bucket latent entry nor a package_path output. " +
                "Wire MiniMaxH3LQPackageSave (samples ← the sampled latent) into the fragment graph — loop-lore fetches its package via GET /view " +
                "(or, fallback, a wrapper node re-emitting the package as a ui files entry).",
            ) as Error & { status: number };

            error.status = 502;
            throw error;
          }

          const clipRef = pickVideoSink(refs,);
          if (!clipRef) { throw new Error("ComfyUI workflow produced no video output",); }
          const clipBuffer = await renderClient.downloadFile(clipRef.file,);
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
          if (latentRef) {
            const latentBuffer = await renderClient.downloadFile(latentRef.file,);
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
            ...(retake ? { resumedFromTake: retake.parentTake, } : {}),
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

  const cancelRun = async (): Promise<void> => {
    if (cancelled) { return; }
    cancelled = true;
    notifyCancel?.();
    await tryCancelRemote();

    cancelVideoJob(jobId, opts.ownerId, "IVSS run cancelled",);
    await db.updateTable("scenario_fragments",).set({
      status: FragmentStatus.Cancelled,
      error: "cancelled",
      updated_at: timestamp(),
    },).where("id", "=", fragment.id,).execute();
  };

  // Owner-scoped HTTP cancel reaches the live closure through the job store.
  const storedJob = getVideoJob(jobId,);
  if (storedJob) { storedJob.cancel = cancelRun; }

  return {
    jobId,
    fragmentId: fragment.id,
    done: run(),
    cancel: cancelRun,
  };
}
