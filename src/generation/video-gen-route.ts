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
import { persistGeneratedImages, } from "../assets/service";
import { checkChatAccess, } from "../chat/service";
import { loadConfig, } from "../config/load";
import { getDatabase, } from "../db/index";
import type { DB, } from "../db/schema";
import { forbiddenResponse, } from "../routes/http-utils";
import { ErrorCode, } from "../routes/http-utils/status";
import { userApiKeyResolver, } from "./providers/user-api-key";
import { getOwnedTemplate, } from "./template-service";
import { parseTemplatePayload, type SimpleTemplatePayload, } from "./template-types";
import { generateVideoWithFailover, } from "./video-engine";

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

  const outcome = await generateVideoWithFailover(
    providers,
    {
      prompt,
      negativePrompt: req.negative_prompt,
      seed: req.seed,
      seconds: req.seconds,
      frames: req.frames,
      width: req.width,
      height: req.height,
    },
    userApiKeyResolver({ userId, config, db, },),
  );

  if (!outcome.ok) {
    return Response.json(
      { error: outcome.error, status: outcome.status, },
      { status: outcome.status, },
    );
  }

  const links = [
    ...(req.messageId ? [{ entityType: "message" as const, entityId: req.messageId, label: "generated", },] : []),
    ...(resolvedChatId ? [{ entityType: "chat" as const, entityId: resolvedChatId, label: "generated", },] : []),
  ];

  const persisted = await persistGeneratedImages({
    database: db,
    uploadDir: config.assets.uploadDir,
    images: [outcome.buffer,],
    mimeType: outcome.mimeType,
    ownerId: userId,
    altText: `Generated video: ${prompt.slice(0, 80,)}`,
    links,
    assetType: "video",
  },);

  const asset = persisted[0]?.asset;
  if (!asset) {
    return Response.json({ error: "video asset persistence failed", }, { status: 500, },);
  }

  return Response.json({
    data: {
      id: asset.id,
      url: `/api/v1/assets/${asset.id}/raw`,
      filename: asset.filename,
      mimeType: asset.mime_type,
      provider: outcome.providerId,
    },
  },);
}
