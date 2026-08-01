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
import { EmotionType, } from "../../db/enums";
import { getDatabase, } from "../../db/index";
import type { DB, } from "../../db/schema";
import { ComfyUIClient, } from "../../generation/providers/comfyui";
import { loadComfyUIWorkflow, } from "../../generation/workflow-loader";
import { getLogger, } from "../../logger";
import { jsonStringifyOr, } from "../../utils";
import { safeFromBase64, } from "../../utils/safe-buffer";
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
  },): Promise<{ avatarId: string; assetId: string }> {
    const emotionModifier = this.getEmotionPromptModifier(opts.emotion,);

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
      case "sdcpp": {
        const sdcppUrl = `${opts.sdConfig.baseUrl.replace(/\/+$/, "",)}/sdcpp/v1/img_gen`;
        const sdcppPayload = jsonStringifyOr({
          prompt,
          negative_prompt: opts.negativePrompt ?? opts.sdConfig.defaults.negativePrompt,
          width: opts.sdConfig.defaults.width,
          height: opts.sdConfig.defaults.height,
          steps: opts.sdConfig.defaults.steps,
          cfg_scale: opts.sdConfig.defaults.cfgScale,
          sampler: opts.sdConfig.defaults.sampler,
          seed: -1,
          batch_size: n,
          output_format: outputFormat,
        },);

        const submitResp = await fetch(sdcppUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", },
          body: sdcppPayload,
          signal: AbortSignal.timeout(30_000,),
        },);

        if (!submitResp.ok) {
          const errText = await submitResp.text().catch(() => "unknown");
          throw new Error(`sd.cpp job submission failed: ${errText}`,);
        }

        const { id: jobId, } = (await submitResp.json()) as { id: string };
        if (!jobId) {
          throw new Error("sd.cpp job submission returned no job id",);
        }

        const genTimeout = opts.sdConfig.generationTimeout ?? 300_000;
        const pollInterval = 500;
        const deadline = Date.now() + genTimeout;

        let jobDone = false;
        let jobImages: string[] = [];

        while (Date.now() < deadline && !jobDone) {
          const jobUrl = `${opts.sdConfig.baseUrl.replace(/\/+$/, "",)}/sdcpp/v1/jobs/${jobId}`;
          const statusResp = await fetch(jobUrl, {
            signal: AbortSignal.timeout(10_000,),
          },);

          if (!statusResp.ok) {
            throw new Error(`sd.cpp job polling failed: HTTP ${statusResp.status}`,);
          }

          const statusData = (await statusResp.json()) as {
            status: string;
            progress?: number;
            images?: string[];
            error?: string;
          };

          if (statusData.status === "done") {
            if (!statusData.images || statusData.images.length === 0) {
              throw new Error("sd.cpp job completed but returned no images",);
            }
            jobImages = statusData.images;
            jobDone = true;
          } else if (statusData.status === "failed" || statusData.status === "cancelled") {
            throw new Error(`sd.cpp job ${statusData.status}: ${statusData.error ?? "no detail"}`,);
          }

          if (!jobDone) {
            await new Promise((r,) => setTimeout(r, pollInterval,));
          }
        }

        if (!jobDone) {
          throw new Error("sd.cpp job timed out",);
        }

        images = jobImages.map((b64,) => {
          const r = safeFromBase64(b64,);
          return r.ok ? r.buffer : Buffer.alloc(0,);
        },);
        mimeType = "image/png";
        break;
      }
      case "comfyui": {
        const validatedComfy = validateProviderUrl(opts.sdConfig.baseUrl,);
        if (!validatedComfy.ok) {
          throw new Error(`Invalid ComfyUI URL: ${validatedComfy.error}`,);
        }

        const workflow = await loadComfyUIWorkflow("txt2img", {
          prompt,
          negativePrompt: opts.negativePrompt,
          width: opts.sdConfig.defaults.width,
          height: opts.sdConfig.defaults.height,
          steps: opts.sdConfig.defaults.steps,
          cfgScale: opts.sdConfig.defaults.cfgScale,
          sampler: opts.sdConfig.defaults.sampler,
        },);

        const comfyClient = new ComfyUIClient({
          baseUrl: opts.sdConfig.baseUrl,
          timeout: opts.sdConfig.generationTimeout ?? 120_000,
        },);

        images = await comfyClient.runWorkflow(workflow,);
        mimeType = "image/png";
        break;
      }
      default: {
        throw new Error(
          `Image gen API family "${
            String(opts.sdConfig.apiFamily,)
          }" not supported for emotion batch generation. Use "openai", "sdapi", "sdcpp", or "comfyui".`,
        );
      }
    }

    // Store generated images as assets and create avatars
    let avatarId = "";
    let assetId = "";

    for (const buffer of images) {
      const id = randomUUID();
      const filename = `emotion-${opts.emotion}-${id.slice(0, 8,)}.${outputFormat}`;

      const { asset: asset } = await createAsset({
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
