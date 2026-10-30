// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import { extractImageMetadata, } from "../assets/metadata";
import { persistGeneratedImages, } from "../assets/service";
import { bindGeneratedActorAvatar, } from "../characters/services/avatar-service";
import { checkChatAccess, } from "../chat/service";
import { loadConfig, } from "../config/load";
import { listSdProviders, } from "../config/schema";
import { AssetType, } from "../db/enums";
import { getDatabase, } from "../db/index";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import { resolveActorAccess, } from "../routes/actor-access";
import { forbiddenResponse, } from "../routes/http-utils";
import { ErrorCode, } from "../routes/http-utils/status";
import { generateImagesWithFailover, } from "./image-engine";
import type { LoRAConfig, } from "./lora/types";
import { userApiKeyResolver, } from "./providers/user-api-key";
import {
  applyImageTemplate,
  getOwnedTemplate,
} from "./template-service";
import { type ImageTemplatePayload, parseTemplatePayload, } from "./template-types";

/**
 * Flat per-image byte estimate for the PRE-PROVIDER quota gate, taken before
 * the output size is known. One 1024x1024 PNG is roughly this big; refusing
 * here avoids paying for a generation this instance cannot store.
 */
const ESTIMATED_IMAGE_BYTES = 1_500_000;

interface ImageGenBody {
  prompt?: string;
  chatId?: string;
  messageId?: string;
  size?: string;
  n?: number;
  output_format?: string;
  steps?: number;
  cfgScale?: number;
  sampler_name?: string;
  negative_prompt?: string;
  seed?: number;
  enable_hr?: boolean;
  hr_scale?: number;
  denoising_strength?: number;
  /** ComfyUI workflow name (filename without .json in configs/workflows/) */
  workflow?: string;
  /** Optional LoRA model to inject into the generation pipeline. */
  lora?: LoRAConfig;
  /** User image-prompt template id — renders `context` into the prompt. */
  templateId?: string;
  /** {{variable}} values substituted into the template body. */
  context?: Record<string, string>;
  /**
   * Avatar Dogfood (slice 1): bind every generated image as a `generated`
   * avatar variant on this actor. Caller must own the actor; checked before
   * the provider runs so a refused request never pays for generation.
   */
  bindActorAvatar?: string;
}

/**
 * Avatar Dogfood (slice 1): bind persisted images as `generated` avatar
 * variants on an actor. The binding op unwinds its own rows on failure, so a
 * mid-bind error surfaces without a partial binding; the persisted assets
 * stay (they are ordinary gallery rows at this point).
 * @param db       Kysely database handle.
 * @param actorId  Owned actor the variants bind to (ownership proven upstream).
 * @param assetIds Persisted asset ids, in generation order.
 * @returns The created avatar ids in input order, or a 500 `Response` when
 *   the binding failed (logged, nothing half-bound).
 */
async function bindGeneratedVariants(
  db: Kysely<DB>,
  actorId: string,
  assetIds: string[],
): Promise<string[] | Response> {
  try {
    return await bindGeneratedActorAvatar(db, { actorId, assetIds, },);
  } catch (error) {
    getLogger().warn("avatar binding after image generation failed", {
      actorId,
      error: error instanceof Error ? error.message : String(error,),
    },);

    return Response.json(
      { error: "Image generated but avatar binding failed; no avatar was created.", status: 500, },
      { status: 500, },
    );
  }
}

/**
 * @param body
 * @param database
 * @param userId
 * @param userRole
 * @returns {Promise<Response>}
 */
export async function handleImageGeneration(
  body: unknown,
  database?: Kysely<DB>,
  userId?: string,
  userRole?: string | null,
): Promise<Response> {
  const req = body as ImageGenBody;

  if (!userId) {
    return Response.json({ error: "Authentication required", status: 401, }, { status: 401, },);
  }

  // Authorization: when linked to a chat, only admin, creator, or a
  // participant may generate images for it — otherwise a user could
  // attach generated assets to a foreign chat (IDOR write).
  // (BUG-generation-control-plane-routes-lack-authorization)
  if (req.chatId) {
    const db = database ?? getDatabase();
    const access = await checkChatAccess(db, req.chatId, userId, userRole,);
    if (!access.ok) { return forbiddenResponse(); }
  }

  // Avatar Dogfood (slice 1): binding generated art onto an actor is a write
  // against that actor, so prove ownership BEFORE the provider call — a
  // refused request must never pay for generation. resolveActorAccess answers
  // 404 for a missing actor and 403 for a foreign one (no existence oracle).
  if (req.bindActorAvatar) {
    const denied = await resolveActorAccess(database ?? getDatabase(), req.bindActorAvatar, userId,);
    if (denied) { return denied; }
  }

  const db = database ?? getDatabase();

  // FEAT-065-IMG: a user template renders the final prompt from {{variables}}
  // when provided; the raw `prompt` field is then optional.
  let prompt = req.prompt;
  let negativePrompt = req.negative_prompt;
  if (req.templateId) {
    const row = await getOwnedTemplate(db, req.templateId, userId,);
    if (!row) {
      return Response.json({ error: "Template not found", status: 404, }, { status: 404, },);
    }

    const payload = parseTemplatePayload(row.payload, row.modality,);
    if (row.modality !== "image" || !payload) {
      return Response.json(
        { error: "Template is not an image template", status: 400, },
        { status: 400, },
      );
    }

    const rendered = applyImageTemplate(payload as ImageTemplatePayload, req.context ?? {},);
    prompt = rendered.prompt;
    negativePrompt = negativePrompt ?? rendered.negativePrompt;
  }

  if (!prompt) {
    return Response.json({ error: "Missing required field: prompt", status: 400, }, { status: 400, },);
  }

  const config = loadConfig();

  const configuredSd = listSdProviders(config.generation.providers.sd, "generate",);

  if (configuredSd.length === 0) {
    return Response.json(
      {
        error: "No image generation provider configured. Set config.generation.providers.sd in your config file.",
        status: 501,
      },
      { status: 501, },
    );
  }

  // LoRA opt-in: only comfyui + sd-server/sdcpp support it — restrict the
  // failover candidates to capable backends instead of rejecting the request
  // outright when the top pick cannot serve a LoRA run. When NO configured
  // backend can serve the run the request is refused, and the message names
  // the families that refused it: an operator reading a 400 needs to know
  // which backend has to change.
  const sdCandidates = req.lora
    ? configuredSd.filter((p,) => p.apiFamily === "comfyui" || p.apiFamily === "sdcpp")
    : configuredSd;

  if (sdCandidates.length === 0) {
    const refusing = [...new Set(configuredSd.map((p,) => p.apiFamily),),].join(", ",);
    return Response.json(
      {
        error: `LoRA is not supported by the configured image backend(s) (${refusing}). Use comfyui or sd-server.`,
        status: 400,
      },
      { status: 400, },
    );
  }

  const n = Math.min(req.n ?? 1, 4,);
  const outputFormat = req.output_format ?? "png";

  // Pre-provider quota gate: refuse BEFORE the provider call when the output
  // cannot fit the remaining hard budget. Paying for an image this instance
  // cannot store is the failure worth preventing, so this runs ahead of
  // `generateImages`. Off by default (no budget row -> one query, no effect).
  // ponytail: a flat per-image estimate; replace with a real size projection
  // only if operators start setting budgets near typical image sizes.
  const { assertGenerationFitsStorage, quotaExceededResponse, storageUnavailableResponse, StorageWriteRefusedError, } =
    await import("../federation/storage-quota");

  try {
    await assertGenerationFitsStorage({
      database: db,
      uploadDir: config.assets.uploadDir,
      estimatedBytes: ESTIMATED_IMAGE_BYTES * n,
      assetType: AssetType.Image,
    },);
  } catch (error) {
    if (error instanceof StorageWriteRefusedError) {
      return error.errorCode === ErrorCode.QuotaExceeded
        ? quotaExceededResponse(error,)
        : storageUnavailableResponse(error,);
    }

    throw error;
  }

  const outcome = await generateImagesWithFailover(
    sdCandidates,
    "generate",
    {
      prompt,
      n,
      size: req.size,
      outputFormat,
      steps: req.steps,
      cfgScale: req.cfgScale,
      samplerName: req.sampler_name,
      negativePrompt,
      seed: req.seed,
      enableHr: req.enable_hr,
      hrScale: req.hr_scale,
      denoisingStrength: req.denoising_strength,
      workflow: req.workflow,
      lora: req.lora,
    },
    userApiKeyResolver({ userId, config, db, },),
  );

  if (!outcome.ok) {
    return Response.json(
      { error: outcome.error, status: outcome.status, },
      { status: outcome.status, },
    );
  }

  const { images, mimeType, } = outcome;

  const links = [
    ...(req.messageId
      ? [{ entityType: "message" as const, entityId: req.messageId, label: "generated", },]
      : []),
    ...(req.chatId
      ? [{ entityType: "chat" as const, entityId: req.chatId, label: "generated", },]
      : []),
  ];

  const persisted = await persistGeneratedImages({
    database: db,
    uploadDir: config.assets.uploadDir,
    images,
    mimeType,
    ownerId: userId,
    altText: (_index, buffer,) => {
      const meta = extractImageMetadata(buffer,);
      return `Generated: ${meta.width}x${meta.height} ${meta.format}`;
    },
    links,
  },);

  // Avatar Dogfood (slice 1): bind each persisted image as a `generated`
  // avatar variant on the target actor (see bindGeneratedVariants).
  const bound = req.bindActorAvatar
    ? await bindGeneratedVariants(db, req.bindActorAvatar, persisted.map(({ asset, },) => asset.id),)
    : null;

  if (bound instanceof Response) { return bound; }
  const avatarIds = bound ?? [];

  const assets = persisted.map(({ asset, }, index,) => ({
    id: asset.id,
    url: `/api/assets/${asset.id}/raw`,
    filename: asset.filename,
    mimeType: asset.mime_type,
    avatarId: avatarIds[index] ?? null,
  }));

  return Response.json({ data: assets, },);
}
