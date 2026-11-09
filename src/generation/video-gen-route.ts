// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * POST /api/v1/generation/video — generate one video clip via a configured
 * ComfyUI video workflow (epic-video-generation Phase A / TASK-video-gen-route).
 *
 * Auth contract mirrors image generation (BUG-generation-control-plane-routes-
 * lack-authorization): 401 without a user, chat linkage scoped by
 * `checkChatAccess` (IDOR write guard), BYO keys resolved per provider name
 * with fail-closed decrypt (epic-byok-api-keys.md).
 */

import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import { persistGeneratedImages, } from "../assets/service";
import { extensionForMime, } from "../assets/service/detect";
import { checkChatAccess, } from "../chat/service";
import { loadConfig, } from "../config/load";
import type { VideoProviderConfig, } from "../config/schema";
import { getDatabase, } from "../db/index";
import type { DB, } from "../db/schema";
import { getChildLogger, } from "../logger";
import { forbiddenResponse, } from "../routes/http-utils";
import { ErrorCode, } from "../routes/http-utils/status";
import { userApiKeyResolver, } from "./providers/user-api-key";
import { getOwnedTemplate, } from "./template-service";
import { parseTemplatePayload, type SimpleTemplatePayload, } from "./template-types";
import { generateVideoWithFailover, type VideoApiKeyResolver, type VideoGenRequest, } from "./video-engine";
import { completeVideoJob, failVideoJob, getVideoJob, storeVideoJob, } from "./video-jobs";

/**
 * Flat per-clip byte estimate for the PRE-PROVIDER quota gate, taken before
 * the output size is known. A short 720p clip is roughly this big; refusing
 * here avoids paying for a render this instance cannot store.
 */
const ESTIMATED_VIDEO_BYTES = 50_000_000;

/** Request body — prompt is required unless a template renders it. */
interface VideoGenBody {
  prompt?: string;
  negative_prompt?: string;
  seed?: number;
  seconds?: number;
  frames?: number;
  width?: number;
  height?: number;
  /** User template whose rendered body becomes the prompt. */
  templateId?: string;
  /** {{variable}} values for the template body. */
  context?: Record<string, string>;
  /** Chat the clip belongs to; linkage requires access. */
  chatId?: string;
  /** Message the clip belongs to; linkage requires access. */
  messageId?: string;
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

  if (!prompt || prompt.trim().length === 0) {
    return Response.json({ error: "Missing required field: prompt", status: 400, }, { status: 400, },);
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
  const generationTimeoutMs = Math.max(...providers.map((provider,) => provider.generationTimeout ?? 0),);
  const jobId = randomUUID();
  storeVideoJob({
    id: jobId,
    ownerId: userId,
    status: "pending",
    request,
    chatId: resolvedChatId,
    messageId: req.messageId,
    providers: [...providers,],
    deadline: Date.now() + generationTimeoutMs,
    createdAt: Date.now(),
  },);

  runVideoRender({
    jobId,
    prompt,
    providers,
    generationTimeout: generationTimeoutMs,
    request,
    resolveApiKey: userApiKeyResolver({ userId, config, db, },),
    database: db,
    uploadDir: config.assets.uploadDir,
    ownerId: userId,
    chatId: resolvedChatId,
    messageId: req.messageId,
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
 * Settle one submitted video job: engine failover, then the persistence
 * block, then mark the job done (or failed with the engine/persist code).
 * A render resolving after its deadline reports failed/504.
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
},): Promise<void> {
  const log = getChildLogger("video-gen",);
  const outcome = await generateVideoWithFailover(job.providers, job.request, job.resolveApiKey,);

  if (Date.now() > (getVideoJob(job.jobId,)?.deadline ?? Number.POSITIVE_INFINITY)) {
    log?.warn("video render resolved after its deadline", { jobId: job.jobId, },);
    failVideoJob(job.jobId, `Video generation timed out after ${job.generationTimeout}ms`, 504,);
    return;
  }

  if (!outcome.ok) {
    failVideoJob(job.jobId, outcome.error, outcome.status,);
    return;
  }

  const links = [
    ...(job.messageId ? [{ entityType: "message" as const, entityId: job.messageId, label: "generated", },] : []),
    ...(job.chatId ? [{ entityType: "chat" as const, entityId: job.chatId, label: "generated", },] : []),
  ];

  const persisted = await persistGeneratedImages({
    database: job.database,
    uploadDir: job.uploadDir,
    images: [outcome.buffer,],
    mimeType: outcome.mimeType,
    ownerId: job.ownerId,
    altText: `Generated video: ${job.prompt.slice(0, 80,)}`,
    links,
    assetType: "video",
    // Per-run identity: a re-rendered prompt must mint a distinct asset
    // row, not collapse onto the byte-identical earlier row (image route
    // precedent). The job id is unique per submit, so it keys each clip.
    makeFilename: () => `${job.jobId}.${extensionForMime(outcome.mimeType,)}`,
  },);

  const asset = persisted[0]?.asset;
  if (!asset) {
    log?.error("video asset persistence failed", undefined, { jobId: job.jobId, },);
    failVideoJob(job.jobId, "video asset persistence failed", 500,);
    return;
  }

  completeVideoJob(job.jobId, {
    id: asset.id,
    url: `/api/v1/assets/${asset.id}/raw`,
    filename: asset.filename,
    mimeType: asset.mime_type,
    provider: outcome.providerId,
  },);
}

/**
 * Poll one submitted video job. Foreign jobs report 404 (not 403) so ids
 * are not oracle-probeable. An expired pending job reports failed/504.
 * @param jobId - the job id from the submit response
 * @param database - unused (jobs are in-memory); kept for route-shape parity
 * @param userId - authenticated caller (required)
 * @param userRole - unused; kept for route-shape parity
 * @returns the job status response
 */
export function handleVideoGenerationStatus(
  jobId: string,
  database?: Kysely<DB>,
  userId?: string,
  userRole?: string | null,
): Response {
  void database;
  void userRole;
  if (!userId) {
    return Response.json({ error: "Authentication required", status: 401, }, { status: 401, },);
  }

  const job = getVideoJob(jobId,);
  // 404 for foreign jobs too: confirming existence would leak another
  // user's job ids one probe at a time.
  if (!job || job.ownerId !== userId) {
    return Response.json({ error: "Video job not found", status: 404, }, { status: 404, },);
  }

  if (job.status === "done" && job.asset) {
    return Response.json({ data: { jobId: job.id, status: "done", asset: job.asset, }, },);
  }

  if (job.status === "failed") {
    return Response.json(
      { data: { jobId: job.id, status: "failed", error: job.error, code: job.errorStatus, }, },
    );
  }

  if (Date.now() > job.deadline) {
    failVideoJob(job.id, "Video generation timed out", 504,);
    return Response.json(
      { data: { jobId: job.id, status: "failed", error: "Video generation timed out", code: 504, }, },
    );
  }

  return Response.json({ data: { jobId: job.id, status: "pending", }, },);
}
