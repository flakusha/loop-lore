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
import { EmotionType, } from "../../db/enums";
import { getDatabase, } from "../../db/index";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";
import { jsonStringifyOr, } from "../../utils";
import { validateProviderUrl, } from "../../utils/url-validation";
import { AvatarService, } from "./avatar-service";

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
    const sdConfig = config.generation.providers.sd;

    if (!sdConfig) {
      throw new Error("No image generation provider configured",);
    }

    const validated = validateProviderUrl(sdConfig.baseUrl,);
    if (!validated.ok) {
      throw new Error(`Invalid image provider URL: ${validated.error}`,);
    }

    const uploadDir = opts.uploadDir ?? config.assets.uploadDir;

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
    sdConfig: NonNullable<ReturnType<typeof loadConfig>["generation"]["providers"]["sd"]>;
    uploadDir: string;
    promptPrefix?: string;
    negativePrompt?: string;
  },): Promise<{ avatarId: string; assetId: string }> {
    const emotionModifier = this.getEmotionPromptModifier(opts.emotion,);
    const prompt = opts.promptPrefix
      ? `${opts.promptPrefix}, ${emotionModifier}`
      : `character portrait, ${emotionModifier}, detailed face, high quality`;

    const n = 1;
    const outputFormat = "png";

    let images: Buffer[];
    let mimeType: string;

    switch (opts.sdConfig.apiFamily) {
      case "openai": {
        const size = `${opts.sdConfig.defaults.width}x${opts.sdConfig.defaults.height}`;
        const url = `${opts.sdConfig.baseUrl.replace(/\/+$/, "",)}/v1/images/generations`;
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          ...(opts.sdConfig.apiKey && { Authorization: `Bearer ${opts.sdConfig.apiKey}`, }),
        };
        const payload = jsonStringifyOr({
          prompt,
          n,
          size,
          output_format: outputFormat,
          ...(opts.negativePrompt && { negative_prompt: opts.negativePrompt, }),
        },);
        const resp = await fetch(url, {
          method: "POST",
          headers,
          body: payload,
          signal: AbortSignal.timeout(opts.sdConfig.generationTimeout ?? 60_000,),
        },);

        if (!resp.ok) {
          const errText = await resp.text().catch(() => "unknown");
          throw new Error(`Image generation failed: ${errText}`,);
        }

        const data = (await resp.json()) as { data: { b64_json: string }[] };
        images = data.data.map((d,) => Buffer.from(d.b64_json, "base64",));
        mimeType = "image/png";
        break;
      }
      case "sdapi": {
        const url = `${opts.sdConfig.baseUrl.replace(/\/+$/, "",)}/sdapi/v1/txt2img`;
        const payload = jsonStringifyOr({
          prompt,
          negative_prompt: opts.negativePrompt ?? opts.sdConfig.defaults.negativePrompt ?? "",
          width: opts.sdConfig.defaults.width,
          height: opts.sdConfig.defaults.height,
          steps: opts.sdConfig.defaults.steps,
          cfg_scale: opts.sdConfig.defaults.cfgScale,
          sampler_name: opts.sdConfig.defaults.sampler,
          batch_size: n,
        },);
        const resp = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: payload,
          signal: AbortSignal.timeout(opts.sdConfig.generationTimeout ?? 120_000,),
        },);

        if (!resp.ok) {
          const errText = await resp.text().catch(() => "unknown");
          throw new Error(`Image generation failed: ${errText}`,);
        }

        const sdData = (await resp.json()) as { images: string[] };
        images = sdData.images.map((b64,) => Buffer.from(b64, "base64",));
        mimeType = "image/png";
        break;
      }
      default: {
        throw new Error(
          `Image gen API family "${opts.sdConfig.apiFamily}" not supported for emotion batch generation. Use "openai" or "sdapi".`,
        );
      }
    }

    // Store generated images as assets and create avatars
    const db = getDatabase();
    let avatarId = "";
    let assetId = "";

    for (const buffer of images) {
      const id = randomUUID();
      const filename = `emotion-${opts.emotion}-${id.slice(0, 8,)}.${outputFormat}`;

      const asset = await createAsset({
        database: db,
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
        database: db,
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
