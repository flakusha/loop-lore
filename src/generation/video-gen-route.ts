// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
// size-allow: 300
/**
 * POST /api/v1/generation/video — generate one video clip via a configured
 * ComfyUI video workflow (epic-video-generation Phase A / TASK-video-gen-route).
 *
 * Auth contract mirrors image generation (BUG-generation-control-plane-routes-
 * lack-authorization): 401 without a user, chat linkage scoped by
 * `checkChatAccess` (IDOR write guard), BYO keys resolved per provider name
 * with fail-closed decrypt (epic-byok-api-keys.md).
 */
import type { DB, } from "../db/schema";
import type { Kysely, } from "kysely";
import type { VideoProviderConfig, } from "../config/schema";
import { ErrorCode, } from "../routes/http-utils/status";
import { callAux, } from "../aux-pipeline/runner";
import { cancelVideoJob, completeVideoJob, failVideoJob, getVideoJob, storeVideoJob, } from "./video-jobs";
import { checkChatAccess, } from "../chat/service";
import { dispatchThroughVideoGate, setVideoPreDispatchHook, VIDEO_QUEUE_WAIT_MS, } from "./video-dispatch-gate";
import { extensionForMime, } from "../assets/service/detect";
import { forbiddenResponse, } from "../routes/http-utils";
import { formatMinimaxPrompt, minimaxModeForWorkflow, } from "./minimax/prompt-format";
import { generateVideoWithFailover, type VideoApiKeyResolver, type VideoGenRequest, } from "./video-engine";
import { getChildLogger, } from "../logger";
import { getDatabase, } from "../db/index";
import { getOwnedTemplate, } from "./template-service";
import { loadConfig, } from "../config/load";
import { parseTemplatePayload, type SimpleTemplatePayload, } from "./template-types";
import { persistGeneratedImages, } from "../assets/service";
import { preflightRequest, } from "./preflight";
import { randomUUID, } from "node:crypto";
import { readEffectiveLlamaSwapConfig, } from "../llm/llama-swap-effective-config";
import { releaseModelsForRender, } from "../llm/llama-swap-release";
import { resolveWorkflowForUseCase, } from "./workflow-selection";
import { type DiscardOnCancelHandle, registerDiscardOnCancel, } from "./cancellation-actions/side-effects";
import { userApiKeyResolver, } from "./providers/user-api-key";
export { handleVideoGenerationStatus, } from "./video-gen-status";

/**
 * Flat per-clip byte estimate for the PRE-PROVIDER quota gate, taken before
 * the output size is known. A short 720p clip is roughly this big; refusing
 * here avoids paying for a render this instance cannot store.
 */
const ESTIMATED_VIDEO_BYTES = 50_000_000;
/** Max prompt length accepted per request. */
const MAX_PROMPT = 2_000;

/** 409 response when the chat was cancelled before the job was stored. */
function cancelledResponse(): Response {
  return Response.json({ error: "Generation cancelled", status: 409, }, { status: 409, },);
}

/**
 * B1 composition: the gate owns the box slot, the sibling unload owns the
 * release semantics. Register once at module load; the box key is
 * intentionally unused (the base resolves from app config — explicit base or
 * `generation.autoStart.llamaSwap.listenPort` from the spawned proxy — never
 * request input). A dead proxy is reported loud (`probeOk:false` + warn) but
 * never aborts the render (runVideoPreDispatchHook logs).
 */
setVideoPreDispatchHook(async () => {
  let listenPort: number | undefined;
  try {
    const effective = await readEffectiveLlamaSwapConfig(
      getDatabase(),
      loadConfig().generation.autoStart?.llamaSwap,
    );

    listenPort = effective?.listenPort;
  } catch {
    listenPort = undefined;
  }

  await releaseModelsForRender({ listenPort, },);
},);

/** Request body — prompt is required unless a template renders it. */
interface VideoGenBody {
interface VideoGenBody {
  prompt?: string;
  negative_prompt?: string;
  seed?: number;
  seconds?: number;
  frames?: number;
  width?: number;
  /** User template whose rendered body becomes the prompt. */
  /** {{variable}} values for the template body. */
  /** Chat the clip belongs to; linkage requires access. */
  /** Message the clip belongs to; linkage requires access. */
  /** Explicit per-request workflow; overrides the stored/config selection. */
  /** LoRA config when a structured caller supplies one — validated, not applied. */
  /** Plain per-cut scenario for MiniMax FL/REF prompt conversion. */
  details?: string;
  shots?: string[];
}

/**
 * Render a video template body by substituting {{variables}} from ctx.
 * @param payload - parsed video/audio (simple) template payload
 * @param ctx - variable values; an unset variable renders as empty
 * @returns the rendered prompt (trimmed)
 */
function renderVideoPrompt(payload: SimpleTemplatePayload, ctx: Record<string, string>,): string {
  return payload.body
    .replace(/\{\{(\w+)\}\}/g, (_match, name: string,) => ctx[name] ?? "",)
    .trim();
}

/**
 * Generate one video clip and persist it as a video asset.
 * @param body - request body (unknown until validated here)
 * @param database - Kysely handle (defaults to the process DB)
 * @param userId - authenticated caller (required)
 * @param userRole - caller role for chat access checks
 * @returns the JSON response with the persisted asset
 */
export async function handleVideoGeneration(
  body: unknown,
  database?: Kysely<DB>,
  userId?: string,
  userRole?: string | null,
): Promise<Response> {
  if (!userId) {
    return Response.json({ error: "Authentication required", status: 401, }, { status: 401, },);
  }

  const req = body as VideoGenBody;
// hint: Logic changed on both sides. Requires understanding intent of each change.

  // Reject malformed structured input before any job is stored or a provider
  // is submitted. Failure follows this route's existing 4xx envelope.
  // req.workflow is a library name (string), not a graph: only a graph
  // object has structure worth validating; names resolve downstream.
  const preflight = preflightRequest({
    workflow: typeof req.workflow === "object" && req.workflow !== null ? req.workflow : undefined,
    lora: req.lora,
  },);

  if (!preflight.ok) {
    return Response.json({ error: preflight.error, status: 400, }, { status: 400, },);
  }

  const db = database ?? getDatabase();

  let resolvedChatId = req.chatId;
  if (req.messageId) {
    const msg = await db.selectFrom("messages",).select("chat_id",).where("id", "=", req.messageId,).executeTakeFirst();
    if (!msg) { return Response.json({ error: "Message not found", status: 404, }, { status: 404, },); }
    if (resolvedChatId && msg.chat_id !== resolvedChatId) {
      return Response.json({ error: "Message does not belong to chat", status: 400, }, { status: 400, },);
    }

    resolvedChatId = resolvedChatId ?? msg.chat_id;
  }

  // Authorization: when linked to a chat, only admin, creator, or a
  // participant may generate media for it (IDOR write guard).
  if (resolvedChatId) {
    const access = await checkChatAccess(db, resolvedChatId, userId, userRole,);
    if (!access.ok) { return forbiddenResponse(); }
  }

  const discard = registerDiscardOnCancel(resolvedChatId, "other",);

  const config = loadConfig();

  // FEAT-065: a user template renders the final prompt from {{variables}}
  // when provided; the raw `prompt` field is then optional.
  let prompt = req.prompt;
  if (req.templateId) {
    const row = await getOwnedTemplate(db, req.templateId, userId,);
    if (!row) {
      return Response.json({ error: "Template not found", status: 404, }, { status: 404, },);
    }

    const payload = parseTemplatePayload(row.payload, row.modality,);
    if (row.modality !== "video" || !payload) {
      return Response.json({ error: "Template is not a video template", status: 400, }, { status: 400, },);
    }

    prompt = renderVideoPrompt(payload as SimpleTemplatePayload, req.context ?? {},);
  }

  // Concatenation (not a template literal): the size gate scans with
  // ts.createScanner, which mis-lexes an interpolated template tail and
  // recounts following comment lines as code.
  if (!prompt || prompt.trim().length === 0 || prompt.length > MAX_PROMPT) {
    return Response.json(
      { error: "prompt must be 1.." + MAX_PROMPT + " characters", status: 400, },
      { status: 400, },
    );
  }

  const providers = config.generation.providers.video;
  if (!providers || providers.length === 0) {
    return Response.json(
      {
        error: "No video generation provider configured. Set config.generation.providers.video in your config file.",
        status: 501,
      },
      { status: 501, },
    );
  }

  // Pre-provider quota gate: refuse BEFORE the provider call when the output
  // cannot fit the remaining hard budget (image route precedent).
  const { assertGenerationFitsStorage, quotaExceededResponse, storageUnavailableResponse, StorageWriteRefusedError, } =
    await import("../federation/storage-quota");

  try {
    await assertGenerationFitsStorage({
      database: db,
      uploadDir: config.assets.uploadDir,
      estimatedBytes: ESTIMATED_VIDEO_BYTES,
      assetType: "video",
    },);
  } catch (error) {
    if (error instanceof StorageWriteRefusedError) {
      return error.errorCode === ErrorCode.QuotaExceeded
        ? quotaExceededResponse(error,)
        : storageUnavailableResponse(error,);
    }

    throw error;
  }

  // Workflow precedence: explicit body field > stored user selection > config
  // default. Config is process-global: copy every provider before overriding
  // its workflow so one user's selection cannot leak into another request.
  // An inline graph object bypasses selection like an explicit name, but it
  // carries no name downstream — only strings override providers and select
  // the MiniMax converter (its startsWith assumes a name).
  const workflowName = typeof req.workflow === "string" ? req.workflow : undefined;
  const workflow = workflowName ?? (req.workflow === undefined
    ? await resolveWorkflowForUseCase({
      database: db,
      userId,
      useCase: "video.generate",
      fallback: providers[0]?.workflow,
    },)
    : undefined);

  const requestProviders = workflow === undefined
    ? providers
    : providers.map((provider,) => ({ ...provider, workflow, }));

  // MiniMax H3 FL/REF exports need the Director heading/shot grammar: a plain
  // scenario would otherwise substitute into an unformatted prompt. Convert
  // through the shared AUX seam (one retry inside) and fail closed on failure.
  const minimaxMode = minimaxModeForWorkflow(workflow,);
  if (minimaxMode) {
    const converted = await formatMinimaxPrompt({
      mode: minimaxMode,
      details: req.details ?? prompt,
      shots: req.shots,
      references: req.references,
      durationSeconds: req.seconds,
    }, {
      call: callAux,
      config,
      db,
      userId,
    },);

    if (!converted.ok) {
      return Response.json({
        error: "minimax_prompt_format_unavailable",
        status: 422,
        reason: converted.reason,
        ...(converted.missing ? { missing: converted.missing, } : {}),
      }, { status: 422, },);
    }

    prompt = converted.prompt;
  }

  // Async submit: the render runs as a floating promise so one HTTP
  // request is not held through a multi-minute ComfyUI render. The
  // background continuation does the same settle flow (failover engine
  // call, then the persistence block) and marks the job done/failed.
  const request: VideoGenRequest = {
    prompt,
    negativePrompt: req.negative_prompt,
    seed: req.seed,
    seconds: req.seconds,
    frames: req.frames,
    width: req.width,
    height: req.height,
  };

  // Deadline: the slowest candidate's generationTimeout. The quota gate
  // above already rejected providers-less config, so max() never sees [].
  const generationTimeoutMs = Math.max(...requestProviders.map((provider,) => provider.generationTimeout ?? 0),);
  if (discard.isDiscarded()) { return cancelledResponse(); }

  const jobId = randomUUID();
  storeVideoJob({
    id: jobId,
    ownerId: userId,
    status: "pending",
    request,
    chatId: resolvedChatId,
    messageId: req.messageId,
    providers: [...requestProviders,],
    deadline: Date.now() + generationTimeoutMs,
    createdAt: Date.now(),
  },);

  runVideoRender({
    jobId,
    prompt,
    providers: requestProviders,
    generationTimeout: generationTimeoutMs,
    request,
    resolveApiKey: userApiKeyResolver({ userId, config, db, },),
    database: db,
    uploadDir: config.assets.uploadDir,
    ownerId: userId,
    chatId: resolvedChatId,
    messageId: req.messageId,
    discard,
  },).catch((error: unknown,) => {
    // Unreachable in practice (the continuation settles every path), but
    // an unhandled rejection would crash the process — mark failed instead.
    getChildLogger("video-gen",)?.error(
      "video render continuation threw",
      error instanceof Error ? error : new Error(String(error,),),
      { jobId, },
    );

    failVideoJob(jobId, error instanceof Error ? error.message : String(error,), 500,);
  },);

  return Response.json({ data: { jobId, status: "pending", }, }, { status: 202, },);
}

/**
 * Settle one submitted video job: per-box gate admission (local providers),
 * engine failover, then the persistence block, then mark the job done (or
 * failed with the engine/persist code). A render resolving after its
 * deadline reports failed/504. A waiter past the queue-wait ceiling reports
 * failed/429 — that ceiling applies at admission only, separate from the submit-based
 * deadline: `generationTimeoutMs` runs from submit (covering wait plus render), the ceiling
 * caps the wait for a box slot (see docs/spec/integrations/video-generation.md).
 * Authorization stays at the submit route: this continuation only settles
 * jobs that already passed the 401/403 checks; the queued job keeps its
 * submitter `ownerId` and the poll route still 404s foreign jobs.
 * @param job - submit-time snapshot consumed by the continuation
 * @returns {Promise<void>}
 */
async function runVideoRender(job: {
  jobId: string;
  prompt: string;
  providers: VideoProviderConfig[];
  /** Slowest candidate timeout, for the late-resolve timeout message. */
  generationTimeout: number;
  request: VideoGenRequest;
  resolveApiKey: VideoApiKeyResolver;
  database: Kysely<DB>;
  uploadDir: string;
  ownerId: string;
  chatId?: string;
  messageId?: string;
  discard: DiscardOnCancelHandle;
},): Promise<void> {
  const log = getChildLogger("video-gen",);
  let outcome: Awaited<ReturnType<typeof generateVideoWithFailover>> | undefined;
  try {
    await dispatchThroughVideoGate({
      providers: job.providers,
      queueWaitMs: VIDEO_QUEUE_WAIT_MS,
      run: () =>
        generateVideoWithFailover(job.providers, job.request, job.resolveApiKey,).then(
          (settled,) => {
            outcome = settled;
          },
        ),
    },);
  } catch (error) {
    // Queue-wait ceiling only: dispatch throws a 429-coded error when the
    // wait for a box slot passes VIDEO_QUEUE_WAIT_MS. Engine failures stay
    // inside `outcome` and settle below — this catch never reinterprets them.
    const status = (error as { status?: number }).status ?? 500;
    const message = error instanceof Error ? error.message : String(error,);
    log?.warn("video render dropped at queue-wait ceiling", { jobId: job.jobId, },);
    failVideoJob(job.jobId, message, status,);
    return;
  }

  if (!outcome) {
    failVideoJob(job.jobId, "video render settled without an outcome", 500,);
    return;
  }

  if (job.discard.isDiscarded()) {
    cancelVideoJob(job.jobId, "Generation cancelled",);
    return;
  }

  if (Date.now() > (getVideoJob(job.jobId,)?.deadline ?? Number.POSITIVE_INFINITY)) {
    log?.warn("video render resolved after its deadline", { jobId: job.jobId, },);
    failVideoJob(job.jobId, `Video generation timed out after ${job.generationTimeout}ms`, 504,);
    return;
  }

  if (!outcome.ok) {
    failVideoJob(job.jobId, outcome.error, outcome.status,);
    return;
  }

  // Closure-narrowing: `outcome` is assigned inside the gate callback, so TS
  // cannot narrow it — bind the settled success once for the block below.
  const settled = outcome;

  const links = [
    ...(job.messageId ? [{ entityType: "message" as const, entityId: job.messageId, label: "generated", },] : []),
    ...(job.chatId ? [{ entityType: "chat" as const, entityId: job.chatId, label: "generated", },] : []),
  ];

  const persisted = await persistGeneratedImages({
    database: job.database,
    uploadDir: job.uploadDir,
    images: [settled.buffer,],
    mimeType: settled.mimeType,
    ownerId: job.ownerId,
    altText: `Generated video: ${job.prompt.slice(0, 80,)}`,
    links,
    assetType: "video",
    // Per-run identity: a re-rendered prompt must mint a distinct asset
    // row, not collapse onto the byte-identical earlier row (image route
    // precedent). The job id is unique per submit, so it keys each clip.
    makeFilename: () => `${job.jobId}.${extensionForMime(settled.mimeType,)}`,
  },);

  const asset = persisted[0]?.asset;
  if (!asset) {
    log?.error("video asset persistence failed", undefined, { jobId: job.jobId, },);
    failVideoJob(job.jobId, "video asset persistence failed", 500,);
    return;
  }

  if (job.discard.isDiscarded()) {
    cancelVideoJob(job.jobId, "Generation cancelled",);
    return;
  }

  completeVideoJob(job.jobId, {
    id: asset.id,
    url: `/api/v1/assets/${asset.id}/raw`,
    filename: asset.filename,
    mimeType: asset.mime_type,
    provider: settled.providerId,
  },);
}
