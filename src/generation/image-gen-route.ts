// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// One linear request pipeline; phase extraction would scatter the flow.
// size-allow: 335

import type { Kysely, } from "kysely";
import { extractImageMetadata, } from "../assets/metadata";
import { getAssetData, getOwnedAsset, persistGeneratedImages, } from "../assets/service";
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
import { registerDiscardOnCancel, } from "./cancellation-actions/side-effects";
import { generateImagesWithFailover, type InitImage, } from "./image-engine";
import { comfyUiFirstOrder, } from "./image-engine/comfyui-first";
import { listStoredComfyUIProviders, mergeComfyUISetups, } from "./image-engine/comfyui-setup";
import { listStoredSdCppProviders, mergeSdCppSetups, } from "./image-engine/sdcpp-setup";
import type { LoRAConfig, } from "./lora/types";
import { validateLoRAConfig, } from "./lora/validation";
import { assertComfyUIModelName, } from "./providers/comfyui-model-discovery";
import { userApiKeyResolver, } from "./providers/user-api-key";
import {
  applyImageTemplate,
  getOwnedTemplate,
} from "./template-service";
import { type ImageTemplatePayload, parseTemplatePayload, } from "./template-types";

import { setAssetAsChatBackground, } from "../routes/chat-backgrounds/service";

/**
 * Flat per-image byte estimate for the PRE-PROVIDER quota gate, taken before
 * the output size is known. One 1024x1024 PNG is roughly this big; refusing
 * here avoids paying for a generation this instance cannot store.
 */
const ESTIMATED_IMAGE_BYTES = 1_500_000;
/** Max prompt length accepted per request. */
const MAX_PROMPT = 2_000;

/** 409 response when the generation was cancelled before persisting output. */
function cancelledResponse(): Response {
  return Response.json({ error: "Generation cancelled", status: 409, }, { status: 409, },);
}

interface ImageGenBody {
  prompt?: string;
  chatId?: string;
  messageId?: string;
  size?: string;
  /** Numeric dimensions; preferred over the openai-shaped `size`. */
  width?: number;
  height?: number;
  /** ComfyUI scheduler axis, independent of `sampler_name`. */
  scheduler?: string;
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
  /** Owning asset id of the img2img init image (ComfyUI path only). */
  init_image?: string;
  /** Optional LoRA model to inject into the generation pipeline. */
  lora?: LoRAConfig;
  /** Picked ComfyUI model roles; each substitutes one graph placeholder. */
  model?: string;
  clip?: string;
  vae?: string;
  clip_vision?: string;
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
  /**
   * When set (and `chatId` is present), bind the first generated image as the
   * chat's active background via a `static` catalog row. Chat access is
   * checked by `chatId` above; without `chatId` this flag is a no-op.
   */
  setAsChatBackground?: boolean;
}

/**
 * Resolve numeric dimensions from the request, falling back to the
 * openai-shaped `size` only when neither numeric field was sent.
 * @param req
 * @returns dimensions, or a 400-ready error for a malformed `size`
 */
function resolveDimensions(req: ImageGenBody,): { width?: number; height?: number; error?: string } {
  if (req.width !== undefined || req.height !== undefined || req.size === undefined) {
    return { width: req.width, height: req.height, };
  }

  const match = /^(\d+)[xX](\d+)$/.exec(req.size.trim(),);
  if (!match) {
    return { error: `Invalid size "${req.size}": expected "WIDTHxHEIGHT"`, };
  }

  return { width: Number(match[1],), height: Number(match[2],), };
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
 * @param req - image request carrying optional model role picks
 * @returns validation error, or null when every pick fits its role
 */
function invalidModelPick(req: ImageGenBody,): string | null {
  for (
    const [role, name,] of [
      ["checkpoint", req.model,],
      ["clip", req.clip,],
      ["vae", req.vae,],
      ["clip_vision", req.clip_vision,],
    ] as const
  ) {
    if (name === undefined) { continue; }
    try {
      assertComfyUIModelName(role, name,);
    } catch (error) {
      return (error as Error).message;
    }
  }

  return null;
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

  // Trust boundary: picked names/strengths reach ComfyUI graph inputs, so
  // reject malformed values before any DB or provider work. ponytail: reuse
  // validateLoRAConfig's permissive [0.1, 1] band while the operator's hard
  // band is open — do not invent a stricter rule here.
  if (req.lora) {
    const loraError = validateLoRAConfig(req.lora,);
    if (loraError) {
      return Response.json({ error: loraError, status: 400, }, { status: 400, },);
    }
  }

  const modelPickError = invalidModelPick(req,);
  if (modelPickError) {
    return Response.json({ error: modelPickError, status: 400, }, { status: 400, },);
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

  const discard = registerDiscardOnCancel(req.chatId, "image-queue",);

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

  // Concatenation (not a template literal): the size gate scans with
  // ts.createScanner, which mis-lexes an interpolated template tail and
  // recounts following comment lines as code.
  if (!prompt || prompt.length > MAX_PROMPT) {
    return Response.json(
      { error: "prompt must be 1.." + MAX_PROMPT + " characters", status: 400, },
      { status: 400, },
    );
  }

  // A malformed `size` is a 400 at the boundary, before any DB or provider
  // work — never a silent fallback to the operator's config default.
  const { width, height, error: sizeError, } = resolveDimensions(req,);
  if (sizeError) {
    return Response.json({ error: sizeError, status: 400, }, { status: 400, },);
  }

  const config = loadConfig();

  // Init image (img2img): reference an asset by id only. Ownership is proven
  // before any bytes are read, so a caller cannot name an arbitrary path or
  // borrow another user's asset. A missing/foreign/deleted asset fails here.
  let initImage: InitImage | undefined;
  if (req.init_image) {
    const owned = await getOwnedAsset(db, req.init_image, userId,);
    if (!owned) {
      return Response.json({ error: "Init image not found", status: 404, }, { status: 404, },);
    }

    let buffer: Buffer | null;
    try {
      buffer = await getAssetData(db, req.init_image, config.assets.uploadDir,);
    } catch {
      // Encrypted assets need a chat key this route does not carry — fail
      // cleanly instead of leaking a decryption error to the caller.
      return Response.json({ error: "Init image could not be read", status: 400, }, { status: 400, },);
    }

    if (!buffer) {
      return Response.json({ error: "Init image not found", status: 404, }, { status: 404, },);
    }

    initImage = { assetId: req.init_image, buffer, };
  }

  // Stored local-engine setups (admin setup surface) join the failover
  // candidates immediately — a stored setup replaces a config-file provider
  // with the same name. One indexed query per family; empty when the operator
  // saved nothing.
  const storedSd = await listStoredSdCppProviders(db,);
  const storedComfy = await listStoredComfyUIProviders(db,);
  const mergedSd = mergeSdCppSetups(config.generation.providers.sd, storedSd,);
  const mergedSdAndComfy = mergeComfyUISetups(mergedSd, storedComfy,);
  const configuredSd = listSdProviders(mergedSdAndComfy, "generate",);

  if (configuredSd.length === 0) {
    return Response.json(
      {
        error: "No image generation provider configured. Set config.generation.providers.sd in your config file.",
        status: 501,
      },
      { status: 501, },
    );
  }

  // ComfyUI-first opt-in (TASK-sd-cpp-provider): when the knob is on, ComfyUI
  // candidates order ahead of the chain. Pure ordering — the walk's discovery
  // gate still skips an unreachable ComfyUI with the structured reason.
  //
  // LoRA opt-in: only comfyui + sd-server/sdcpp support it — restrict the
  // failover candidates to capable backends instead of rejecting the request
  // outright when the top pick cannot serve a LoRA run. When NO configured
  // backend can serve the run the request is refused, and the message names
  // the families that refused it: an operator reading a 400 needs to know
  // which backend has to change.
  const sdCandidates = comfyUiFirstOrder(
    req.lora
      ? configuredSd.filter((p,) => p.apiFamily === "comfyui" || p.apiFamily === "sdcpp")
      : configuredSd,
    config.generation.imageRouting?.comfyUiFirst,
  );

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

  // An init image is meaningful only on the ComfyUI workflow path. Limit
  // candidates so a non-ComfyUI failover target cannot silently run txt2img.
  const editCandidates = initImage
    ? sdCandidates.filter((p,) => p.apiFamily === "comfyui")
    : sdCandidates;

  if (initImage && editCandidates.length === 0) {
    return Response.json(
      { error: "An init image requires a ComfyUI generation provider", status: 400, },
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
    editCandidates,
    "generate",
    {
      prompt,
      n,
      size: req.size,
      width,
      height,
      scheduler: req.scheduler,
      outputFormat,
      steps: req.steps,
      cfgScale: req.cfgScale,
      samplerName: req.sampler_name,
      negativePrompt,
      seed: req.seed,
      enableHr: req.enable_hr,
      hrScale: req.hr_scale,
      denoise: req.denoising_strength,
      workflow: req.workflow,
      initImage,
      lora: req.lora,
      model: req.model,
      clip: req.clip,
      vae: req.vae,
      clipVision: req.clip_vision,
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

  if (discard.isDiscarded()) { return cancelledResponse(); }

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

  if (discard.isDiscarded()) { return cancelledResponse(); }

  // Avatar Dogfood (slice 1): bind each persisted image as a `generated`
  // avatar variant on the target actor (see bindGeneratedVariants).
  const bound = req.bindActorAvatar
    ? await bindGeneratedVariants(db, req.bindActorAvatar, persisted.map(({ asset, },) => asset.id),)
    : null;

  if (bound instanceof Response) { return bound; }
  const avatarIds = bound ?? [];

  // Persist the first generated image as the chat's active background when
  // requested. Requires `chatId` (authorized above); otherwise a no-op.
  if (req.setAsChatBackground && req.chatId && persisted.length > 0) {
    await setAssetAsChatBackground({
      database: db,
      chatId: req.chatId,
      assetId: persisted[0]!.asset.id,
    },);
  }

  const assets = persisted.map(({ asset, }, index,) => ({
    id: asset.id,
    url: `/api/v1/assets/${asset.id}/raw`,
    filename: asset.filename,
    mimeType: asset.mime_type,
    avatarId: avatarIds[index] ?? null,
  }));

  return Response.json({ data: assets, },);
}
