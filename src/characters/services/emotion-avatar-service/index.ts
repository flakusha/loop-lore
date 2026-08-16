// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

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
 * The concrete generation logic lives in isolated dispatcher modules
 * (generation, emotions, job-store) threaded with a structural handle. The
 * job store is in-memory and persists for the server lifetime. `EmotionAvatarService`
 * remains a class because consumers instantiate it via `new`.
 *
 * @module characters/services/emotion-avatar-service
 */
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import type { EmotionEntry, } from "../../../config/sections/templates";
import type { EmotionType, } from "../../../db/enums";
import { getDatabase, } from "../../../db/index";
import type { DB, } from "../../../db/schema";
import { getLogger, } from "../../../logger";
import { AvatarService, } from "../avatar-service";
import {
  DEFAULT_EMOTIONS,
  getEmotionPromptModifier as getEmotionPromptModifierDispatch,
  resolveEmotionPromptModifier as resolveEmotionPromptModifierDispatch,
} from "./emotions";
import {
  generateEmotionAvatar as generateEmotionAvatarDispatch,
  runBatchGeneration,
} from "./generation";
import {
  cancelJob as cancelJobDispatch,
  createJob,
  getJob,
  listJobs as listJobsDispatch,
  storeJob,
} from "./job-store";
import type {
  BatchGenerationJob,
  BatchJobId,
  GenerateEmotionAvatarsOpts,
} from "./types";

export type {
  BatchGenerationJob,
  BatchJobId,
  EmotionGenerationResult,
  GenerateEmotionAvatarsOpts,
} from "./types";

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
    const job = createJob({
      id: jobId,
      actorId: opts.actorId,
      baseAvatarId: opts.baseAvatarId,
      emotions,
    },);

    storeJob(job,);

    // Start generation in background (non-blocking)
    void (async () => {
      try {
        await runBatchGeneration(
          {
            db: this.db,
            avatarService: this.avatarService,
            resolveEmotionPromptModifier: (emotion, avatarEmotions,) =>
              this.resolveEmotionPromptModifier(emotion, avatarEmotions,),
            generateEmotionAvatar: (genOpts,) => this.generateEmotionAvatar(genOpts,),
          },
          job,
          opts,
        );
      } catch (error) {
        getLogger().error(
          "Batch emotion avatar generation failed",
          error instanceof Error ? error : new Error(String(error,),),
          { jobId: job.id, },
        );
        job.status = "failed";
        job.error = String(error,);
        job.completedAt = new Date().toISOString();
      }
    })();

    return jobId;
  }

  /**
   * Get status of a batch generation job.
   *
   * @param jobId - Batch job ID
   * @returns Job status or undefined if not found
   */
  getJobStatus(jobId: BatchJobId,): BatchGenerationJob | undefined {
    return getJob(jobId,);
  }

  /**
   * Cancel a running batch generation job.
   *
   * @param jobId - Batch job ID
   * @returns true if cancelled, false if not found or already completed
   */
  cancelJob(jobId: BatchJobId,): boolean {
    return cancelJobDispatch(jobId,);
  }

  /**
   * List all batch jobs for an actor.
   *
   * @param actorId - Character actor ID
   * @returns List of jobs
   */
  listJobs(actorId: string,): BatchGenerationJob[] {
    return listJobsDispatch(actorId,);
  }

  /**
   * Get emotion prompt modifier for a given emotion.
   *
   * @param emotion - Emotion type
   * @returns Prompt modifier string
   */
  getEmotionPromptModifier(emotion: EmotionType,): string {
    return getEmotionPromptModifierDispatch(emotion,);
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
    return resolveEmotionPromptModifierDispatch(emotion, avatarEmotions,);
  }

  /**
   * Generate a single emotion avatar variant.
   *
   * @param opts - Generation options
   * @returns Generated avatar ID and linked asset ID
   */
  private async generateEmotionAvatar(opts: {
    actorId: string;
    emotion: EmotionType;
    sdConfig: import("../../../config/schema").ImageProviderConfig;
    uploadDir: string;
    promptPrefix?: string;
    negativePrompt?: string;
    baseAvatarId?: string;
    fallbackMode?: "generation" | "none";
    avatarEmotions?: Record<string, EmotionEntry>;
  },): Promise<{ avatarId: string; assetId: string }> {
    return generateEmotionAvatarDispatch({
      db: this.db,
      avatarService: this.avatarService,
      resolveEmotionPromptModifier: (emotion, avatarEmotions,) =>
        this.resolveEmotionPromptModifier(emotion, avatarEmotions,),
      generateEmotionAvatar: (genOpts,) => this.generateEmotionAvatar(genOpts,),
    }, opts,);
  }
}
