// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/characters/services/emotion-avatar-service/generation.ts — Batch generation logic

import type { Kysely, } from "kysely";
import { loadConfig, } from "../../../config/load";
import { pickSdProvider, } from "../../../config/schema";
import type { ImageProviderConfig, } from "../../../config/schema";
import type { EmotionEntry, } from "../../../config/sections/templates";
import { EmotionType, } from "../../../db/enums";
import type { DB, } from "../../../db/schema";
import type { MattingProvider, } from "../../../generation/matting/types";
import { getLogger, } from "../../../logger";
import { validateProviderUrl, } from "../../../utils/url-validation";
import type { AvatarService, } from "../avatar-service";
import { recordBatchFinish, recordBatchStart, } from "./job-records";
import type { BatchGenerationJob, GenerateEmotionAvatarsOpts, } from "./types";

import { randomUUID, } from "node:crypto";
import { persistGeneratedImages, } from "../../../assets/service";
import { generateImages, } from "../../../generation/image-engine";
import { enqueueAutoMatting, } from "../../../generation/matting/auto-matte";
import {
  buildEmotionPrompt,
  extractAvatarMetadata,
} from "../emotion-avatar-fallback";
import { emitJobProgress, jobProgress, } from "./job-events";

// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
// src/characters/services/emotion-avatar-service/generation.ts — Batch generation logic

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
  /** When set, opaque generated sprites are auto-enqueued for matting. */
  mattingProvider?: MattingProvider;
  /** Outfit scope: the created avatar variant's outfit FK + prompt slot. */
  outfitId?: string;
}

/**
 * Delete prior variants for one (emotion, outfit scope) slot, keeping the
 * freshly generated avatar. Outfit-scoped regen isolation: a re-roll of
 * angry-in-armor deletes only angry-in-armor rows — angry-in-court-dress
 * and other emotions of the same outfit are never touched.
 *
 * Exported as the unit that owns slot-replace isolation (behavior-pinned
 * by outfit-scope tests).
 * @param svc
 * @param opts
 * @param opts.actorId
 * @param opts.emotion
 * @param opts.outfitId - undefined = outfitless (base) slot
 * @param opts.exceptAvatarId - the surviving fresh variant
 * @returns void
 */
export async function deleteOutfitEmotionVariants(
  svc: GenerationDispatchHandle,
  opts: { actorId: string; emotion: string; outfitId?: string; exceptAvatarId: string },
): Promise<void> {
  const avatars = await svc.avatarService.getAvatars(opts.actorId,);
  for (const avatar of avatars) {
    if (avatar.id === opts.exceptAvatarId) { continue; }
    if (avatar.tags.emotion?.toLowerCase() !== opts.emotion.toLowerCase()) { continue; }
    const sameScope = (avatar.outfitId ?? undefined) === opts.outfitId;
    if (!sameScope) { continue; }
    await svc.avatarService.deleteAvatar(avatar.id,);
  }
}

/**
 * Run the batch generation job.
 *
 * Generates images for each emotion sequentially to avoid
 * overwhelming the image generation provider.
 * @param svc
 * @param job
 * @param opts
 * @returns void
 * @throws {Error}
 * @throws {Error}
 */
export async function runBatchGeneration(
  svc: GenerationDispatchHandle,
  job: BatchGenerationJob,
  opts: GenerateEmotionAvatarsOpts,
): Promise<void> {
  // Validate provider config BEFORE recording the start: a throw here leaves
  // no row behind, so the gallery can never misread a stillborn batch as
  // in-flight work.
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

  job.status = "running";
  await recordBatchStart(svc.db, job, opts,);

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
      job.completedAt = new Date().toISOString();
      await recordBatchFinish(svc.db, job,);
      emitJobProgress(jobProgress(job,),);
      return;
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
        mattingProvider: opts.mattingProvider,
        outfitId: opts.outfitId,
      },);

      // Replace mode: drop prior variants for this exact (emotion, outfit)
      // slot AFTER the new one landed — failed re-rolls keep the old
      // variant, and sibling outfits are never in scope.
      if (opts.replace) {
        await deleteOutfitEmotionVariants(svc, {
          actorId: opts.actorId,
          emotion: result.emotion,
          outfitId: opts.outfitId,
          exceptAvatarId: generated.avatarId,
        },);
      }

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

    emitJobProgress(jobProgress(job,),);
  }

  job.status = job.results.every((r,) => r.status === "completed") ? "completed" : "failed";
  job.completedAt = new Date().toISOString();
  await recordBatchFinish(svc.db, job,);
  emitJobProgress(jobProgress(job,),);
}
