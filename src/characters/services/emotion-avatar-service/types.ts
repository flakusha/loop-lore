// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/characters/services/emotion-avatar-service/types.ts — Public types

import type { EmotionType, } from "../../../db/enums";

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
