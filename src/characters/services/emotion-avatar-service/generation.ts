// src/characters/services/emotion-avatar-service/generation.ts — Batch generation logic

import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import { createAsset, linkAsset, } from "../../../assets/service";
import { loadConfig, } from "../../../config/load";
import { pickSdProvider, } from "../../../config/schema";
import type { ImageProviderConfig, } from "../../../config/schema";
import type { EmotionEntry, } from "../../../config/sections/templates";
import { EmotionType, } from "../../../db/enums";
import type { DB, } from "../../../db/schema";
import { generateImages, } from "../../../generation/image-engine";
import { getLogger, } from "../../../logger";
import { validateProviderUrl, } from "../../../utils/url-validation";
import type { AvatarService, } from "../avatar-service";
import {
  buildEmotionPrompt,
  extractAvatarMetadata,
} from "../emotion-avatar-fallback";
import type { BatchGenerationJob, GenerateEmotionAvatarsOpts, } from "./types";

/**
 * Minimal structural handle onto the owning service, threading the state the
 * generation logic needs (`db`, `avatarService`, `resolveEmotionPromptModifier`).
 */
export interface GenerationDispatchHandle {
  db: Kysely<DB>;
  avatarService: AvatarService;
  resolveEmotionPromptModifier(emotion: EmotionType, avatarEmotions?: Record<string, EmotionEntry>,): string;
  generateEmotionAvatar(opts: GenerateEmotionAvatarOpts,): Promise<{ avatarId: string; assetId: string }>;
}

/**
 * Options for generating a single emotion avatar variant.
 */
export interface GenerateEmotionAvatarOpts {
  actorId: string;
  emotion: EmotionType;
  sdConfig: ImageProviderConfig;
  uploadDir: string;
  promptPrefix?: string;
  negativePrompt?: string;
  baseAvatarId?: string;
  fallbackMode?: "generation" | "none";
  avatarEmotions?: Record<string, EmotionEntry>;
}

/**
 * Run the batch generation job.
 *
 * Generates images for each emotion sequentially to avoid
 * overwhelming the image generation provider.
 */
export async function runBatchGeneration(
  svc: GenerationDispatchHandle,
  job: BatchGenerationJob,
  opts: GenerateEmotionAvatarsOpts,
): Promise<void> {
  job.status = "running";

  const config = loadConfig();
  const sdConfig = pickSdProvider(config.generation.providers.sd, "generate",);
  // Config-driven per-emotion intent/asset map consumed by prompt building.
  const avatarEmotions = config.templates.avatar.emotions;

  if (!sdConfig) {
    throw new Error("No image generation provider configured",);
  }

  const validated = validateProviderUrl(sdConfig.baseUrl,);
  if (!validated.ok) {
    throw new Error(`Invalid image provider URL: ${validated.error}`,);
  }

  const uploadDir = opts.uploadDir ?? config.assets.uploadDir;
  const fallbackMode = config.generation.emotionAvatar?.fallbackMode ?? "generation";

  // Log fallback mode for monitoring
  getLogger().info(
    "Emotion avatar batch generation started",
    {
      jobId: job.id,
      actorId: opts.actorId,
      emotions: job.results.length,
      fallbackMode,
      hasPromptPrefix: !!opts.promptPrefix,
      hasBaseAvatar: !!opts.baseAvatarId,
    },
  );

  for (const result of job.results) {
    // Status can change to "cancelled" via cancelJob() at runtime
    if ((job.status as string) === "cancelled") {
      break;
    }

    result.status = "generating";

    try {
      const generated = await svc.generateEmotionAvatar({
        actorId: opts.actorId,
        emotion: result.emotion,
        sdConfig,
        uploadDir,
        promptPrefix: opts.promptPrefix,
        negativePrompt: opts.negativePrompt,
        baseAvatarId: opts.baseAvatarId,
        fallbackMode,
        avatarEmotions,
      },);

      result.avatarId = generated.avatarId;
      result.assetId = generated.assetId;
      result.status = "completed";
    } catch (error) {
      result.status = "failed";
      result.error = String(error,);
      getLogger().error(
        "Failed to generate emotion avatar",
        error instanceof Error ? error : new Error(String(error,),),
        { jobId: job.id, emotion: result.emotion, },
      );
    }
  }

  job.status = job.results.every((r,) => r.status === "completed") ? "completed" : "failed";
  job.completedAt = new Date().toISOString();
}

/**
 * Generate a single emotion avatar variant.
 */
export async function generateEmotionAvatar(
  svc: GenerationDispatchHandle,
  opts: {
    actorId: string;
    emotion: EmotionType;
    sdConfig: ImageProviderConfig;
    uploadDir: string;
    promptPrefix?: string;
    negativePrompt?: string;
    baseAvatarId?: string;
    fallbackMode?: "generation" | "none";
    avatarEmotions?: Record<string, EmotionEntry>;
  },
): Promise<{ avatarId: string; assetId: string }> {
  const emotionModifier = svc.resolveEmotionPromptModifier(opts.emotion, opts.avatarEmotions,);

  // Build prompt: use explicit prefix if provided, otherwise use metadata fallback
  let prompt: string;
  let usedFallback = false;

  if (opts.promptPrefix) {
    prompt = `${opts.promptPrefix}, ${emotionModifier}`;
  } else if (opts.baseAvatarId && opts.fallbackMode !== "none") {
    // Extract metadata from base avatar for fallback prompt construction
    const metadata = await extractAvatarMetadata(svc.db, opts.baseAvatarId,);
    prompt = buildEmotionPrompt(metadata, opts.emotion, emotionModifier,);
    usedFallback = true;
  } else {
    prompt = `character portrait, ${emotionModifier}, detailed face, high quality`;
  }

  // Log fallback usage for monitoring
  if (usedFallback) {
    getLogger().info(
      "Using metadata fallback for emotion avatar prompt",
      {
        emotion: opts.emotion,
        baseAvatarId: opts.baseAvatarId,
        promptLength: prompt.length,
      },
    );
  }

  const n = 1;
  const outputFormat = "png";

  const outcome = await generateImages(opts.sdConfig, {
    prompt,
    n,
    outputFormat,
  },);

  if (!outcome.ok) {
    throw new Error(outcome.error,);
  }

  const { images, mimeType, } = outcome;

  // Store generated images as assets and create avatars
  let avatarId = "";
  let assetId = "";

  for (const buffer of images) {
    const id = randomUUID();
    const filename = `emotion-${opts.emotion}-${id.slice(0, 8,)}.${outputFormat}`;

    const { asset: asset, } = await createAsset({
      database: svc.db,
      input: {
        ownerId: opts.actorId,
        filename,
        mimeType,
        assetType: "image",
        sizeBytes: buffer.length,
        buffer,
        altText: `Emotion avatar: ${opts.emotion}`,
      },
      uploadDir: opts.uploadDir,
    },);

    assetId = asset.id;

    // Create avatar with emotion tag
    avatarId = await svc.avatarService.createAvatar({
      actorId: opts.actorId,
      assetId: asset.id,
      label: `${opts.emotion} expression`,
      tags: { emotion: opts.emotion, },
      isPrimary: false,
      sortOrder: Object.values(EmotionType,).indexOf(opts.emotion,) + 1,
    },);

    // Link asset to character
    await linkAsset({
      database: svc.db,
      assetId: asset.id,
      link: {
        entityType: "actor",
        entityId: opts.actorId,
        label: `emotion:${opts.emotion}`,
      },
    },);
  }

  return { avatarId, assetId, };
}
