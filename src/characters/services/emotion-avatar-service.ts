/**
 * Emotion Avatar Batch Generation Service
 *
 * Generates emotion-specific avatar variants for characters.
 * Triggered from character options menu (not automatic).
 *
 * Given a base character avatar, generates variants for different
 * emotional states using the image generation pipeline.
 * Results are stored as linked assets with emotion labels.
 *
 * @module characters/services/emotion-avatar-service
 */

import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import { createAsset, linkAsset, } from "../../assets/service";
import { loadConfig, } from "../../config/load";
import { pickSdProvider, } from "../../config/schema";
import type { EmotionEntry, } from "../../config/sections/templates";
import { EmotionType, } from "../../db/enums";
import { getDatabase, } from "../../db/index";
import type { DB, } from "../../db/schema";
import { generateImages, } from "../../generation/image-engine";
import { getLogger, } from "../../logger";
import { validateProviderUrl, } from "../../utils/url-validation";
import { AvatarService, } from "./avatar-service";
import {
  buildEmotionPrompt,
  extractAvatarMetadata,
} from "./emotion-avatar-fallback";

/** Branded type for batch job IDs */
export type BatchJobId = string & { readonly __brand: "BatchJobId" };

/** Emotion avatar generation request */
export interface GenerateEmotionAvatarsOpts {
  /** Character actor ID */
  actorId: string;
  /** Base avatar ID to derive emotion variants from */
  baseAvatarId: string;
  /** Emotions to generate (defaults to all) */
  emotions?: EmotionType[];
  /** Upload directory override */
  uploadDir?: string;
  /** Custom prompt prefix for emotion modifiers */
  promptPrefix?: string;
  /** Negative prompt to apply */
  negativePrompt?: string;
}

/** Status of a single emotion generation */
export interface EmotionGenerationResult {
  emotion: EmotionType;
  status: "pending" | "generating" | "completed" | "failed";
  avatarId?: string;
  assetId?: string;
  error?: string;
}

/** Batch generation job status */
export interface BatchGenerationJob {
  id: BatchJobId;
  actorId: string;
  baseAvatarId: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  results: EmotionGenerationResult[];
  startedAt: string;
  completedAt?: string;
  error?: string;
}

/** In-memory job store (persists until server restart) */
const activeJobs = new Map<BatchJobId, BatchGenerationJob>();

/** Emotion-to-prompt-modifier mapping */
const EMOTION_PROMPT_MODIFIERS: Record<EmotionType, string> = {
  [EmotionType.Happy]: "happy expression, smiling, bright eyes, cheerful",
  [EmotionType.Sad]: "sad expression, downcast eyes, melancholy, sorrowful",
  [EmotionType.Angry]: "angry expression, furrowed brow, intense gaze, furious",
  [EmotionType.Fearful]: "fearful expression, wide eyes, trembling, scared",
  [EmotionType.Surprised]: "surprised expression, raised eyebrows, wide eyes, astonished",
  [EmotionType.Disgusted]: "disgusted expression, wrinkled nose, repulsed",
  [EmotionType.Contemptuous]: "contemptuous expression, sneering, disdainful look",
  [EmotionType.Neutral]: "neutral expression, calm face, natural look",
  [EmotionType.Excited]: "excited expression, enthusiastic, eager, thrilled",
  [EmotionType.Anxious]: "anxious expression, worried brow, nervous, tense",
  [EmotionType.Calm]: "calm expression, serene face, peaceful, composed",
  [EmotionType.Confused]: "confused expression, tilted head, puzzled, bewildered",
  [EmotionType.Proud]: "proud expression, confident, chin up, dignified",
  [EmotionType.Shameful]: "shameful expression, looking away, embarrassed, guilty",
  [EmotionType.Loving]: "loving expression, warm gaze, tender, affectionate",
  [EmotionType.Jealous]: "jealous expression, envious, bitter, resentful",
  [EmotionType.Grateful]: "grateful expression, thankful, appreciative, warm",
  [EmotionType.Bored]: "bored expression, disinterested, vacant stare, apathetic",
};

/** Default emotions to generate if none specified */
const DEFAULT_EMOTIONS: EmotionType[] = [
  EmotionType.Happy,
  EmotionType.Sad,
  EmotionType.Angry,
  EmotionType.Surprised,
  EmotionType.Fearful,
  EmotionType.Neutral,
  EmotionType.Excited,
  EmotionType.Calm,
];

/**
 * Emotion Avatar Batch Generation Service
 *
 * Generates emotion-specific avatar variants for characters.
 * All generation is triggered explicitly from the character options menu.
 */
export class EmotionAvatarService {
  private readonly db: Kysely<DB>;
  private readonly avatarService: AvatarService;

  constructor(db?: Kysely<DB>,) {
    this.db = db ?? getDatabase();
    this.avatarService = new AvatarService(this.db,);
  }

  /**
   * Start batch generation of emotion avatars.
   *
   * This is called from the character options menu — NOT automatically
   * after avatar addition.
   *
   * @param opts - Generation options
   * @returns Batch job ID for tracking
   */
  async startBatchGeneration(opts: GenerateEmotionAvatarsOpts,): Promise<BatchJobId> {
    const jobId = randomUUID() as BatchJobId;
    const emotions = opts.emotions ?? DEFAULT_EMOTIONS;

    // Verify base avatar exists
    const baseAvatar = await this.avatarService.getAvatar(opts.baseAvatarId,);
    if (!baseAvatar) {
      throw new Error(`Base avatar ${opts.baseAvatarId} not found`,);
    }

    if (baseAvatar.actorId !== opts.actorId) {
      throw new Error(`Base avatar does not belong to actor ${opts.actorId}`,);
    }

    // Initialize job
    const job: BatchGenerationJob = {
      id: jobId,
      actorId: opts.actorId,
      baseAvatarId: opts.baseAvatarId,
      status: "pending",
      results: emotions.map((emotion,) => ({
        emotion,
        status: "pending" as const,
      })),
      startedAt: new Date().toISOString(),
    };

    activeJobs.set(jobId, job,);

    // Start generation in background (non-blocking)
    this.runBatchJob(job, opts,).catch((error,) => {
      getLogger().error(
        "Batch emotion avatar generation failed",
        error instanceof Error ? error : new Error(String(error,),),
        { jobId: job.id, },
      );
      job.status = "failed";
      job.error = String(error,);
      job.completedAt = new Date().toISOString();
    },);

    return jobId;
  }

  /**
   * Get status of a batch generation job.
   *
   * @param jobId - Batch job ID
   * @returns Job status or undefined if not found
   */
  getJobStatus(jobId: BatchJobId,): BatchGenerationJob | undefined {
    return activeJobs.get(jobId,);
  }

  /**
   * Cancel a running batch generation job.
   *
   * @param jobId - Batch job ID
   * @returns true if cancelled, false if not found or already completed
   */
  cancelJob(jobId: BatchJobId,): boolean {
    const job = activeJobs.get(jobId,);
    if (!job || job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
      return false;
    }

    job.status = "cancelled";
    job.completedAt = new Date().toISOString();

    // Mark pending results as failed
    for (const result of job.results) {
      if (!(result.status === "pending" || result.status === "generating")) {
        continue;
      }

      result.status = "failed";
      result.error = "Cancelled by user";
    }

    return true;
  }

  /**
   * List all batch jobs for an actor.
   *
   * @param actorId - Character actor ID
   * @returns List of jobs
   */
  listJobs(actorId: string,): BatchGenerationJob[] {
    const jobs: BatchGenerationJob[] = [];
    for (const job of activeJobs.values()) {
      if (job.actorId === actorId) {
        jobs.push(job,);
      }
    }
    return jobs.sort((a, b,) => b.startedAt.localeCompare(a.startedAt,));
  }

  /**
   * Get emotion prompt modifier for a given emotion.
   *
   * @param emotion - Emotion type
   * @returns Prompt modifier string
   */
  getEmotionPromptModifier(emotion: EmotionType,): string {
    return EMOTION_PROMPT_MODIFIERS[emotion] ?? "neutral expression";
  }

  /**
   * Resolve the generation prompt modifier for an emotion, preferring the
   * config-driven per-emotion intent description
   * (config.templates.avatar.emotions — keyed by lowercase emotion name) over
   * the built-in EMOTION_PROMPT_MODIFIERS table. This is what consumes the
   * avatar emotion asset map the generation path previously ignored.
   *
   * @param emotion - Emotion type being generated
   * @param avatarEmotions - Optional config emotion map (lowercase keys)
   * @returns Prompt modifier string
   */
  resolveEmotionPromptModifier(emotion: EmotionType, avatarEmotions?: Record<string, EmotionEntry>,): string {
    const intent = avatarEmotions?.[(emotion as string).toLowerCase()]?.intent;
    return intent ?? this.getEmotionPromptModifier(emotion,);
  }

  /**
   * Run the batch generation job.
   *
   * Generates images for each emotion sequentially to avoid
   * overwhelming the image generation provider.
   */
  private async runBatchJob(
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
        const generated = await this.generateEmotionAvatar({
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
  private async generateEmotionAvatar(opts: {
    actorId: string;
    emotion: EmotionType;
    sdConfig: import("../../config/schema").ImageProviderConfig;
    uploadDir: string;
    promptPrefix?: string;
    negativePrompt?: string;
    baseAvatarId?: string;
    fallbackMode?: "generation" | "none";
    avatarEmotions?: Record<string, EmotionEntry>;
  },): Promise<{ avatarId: string; assetId: string }> {
    const emotionModifier = this.resolveEmotionPromptModifier(opts.emotion, opts.avatarEmotions,);

    // Build prompt: use explicit prefix if provided, otherwise use metadata fallback
    let prompt: string;
    let usedFallback = false;

    if (opts.promptPrefix) {
      prompt = `${opts.promptPrefix}, ${emotionModifier}`;
    } else if (opts.baseAvatarId && opts.fallbackMode !== "none") {
      // Extract metadata from base avatar for fallback prompt construction
      const metadata = await extractAvatarMetadata(this.db, opts.baseAvatarId,);
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
        database: this.db,
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
      avatarId = await this.avatarService.createAvatar({
        actorId: opts.actorId,
        assetId: asset.id,
        label: `${opts.emotion} expression`,
        tags: { emotion: opts.emotion, },
        isPrimary: false,
        sortOrder: Object.values(EmotionType,).indexOf(opts.emotion,) + 1,
      },);

      // Link asset to character
      await linkAsset({
        database: this.db,
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
}
