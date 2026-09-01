// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * GenerateRequest — HTTP request shape for POST /api/generation/generate.
 *
 * Extracted from generate-route.ts into its own module to break the type-only
 * circular import between the handleGenerate orchestrator and its pipeline
 * step modules (build-prompt / stream-to-client / non-stream).
 */

import type { GenerationMessage, GenerationOptions, } from "../types";

/** */
export interface GenerateRequest {
  /** Chat to generate for */
  chatId: string;
  /** Parent message ID (user message being responded to) */
  parentMessageId: string;
  /** Actor generating the response */
  actorId: string;
  /** Model override (uses config default if absent) */
  modelId?: string;
  /** Provider override (uses config default if absent) */
  provider?: string;
  /** Explicit prompt messages (uses prompt assembler if absent) */
  prompt?: GenerationMessage[];
  /** Inject actor `mes_example` few-shot pairs into the prompt (default: true for chat-reply). */
  includeExamples?: boolean;
  /** System prompt override */
  systemPrompt?: string;
  /** Generation params */
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  /** Stream response (default: false) */
  stream?: boolean;
  /** Idempotency key for dedup */
  idempotencyKey: string;
  /** Repetition detection config */
  repetitionDetection: GenerationOptions["repetitionDetection"];
  /** Policy detection config */
  policyDetection: GenerationOptions["policyDetection"];
  /** Response limit config */
  responseLimit: GenerationOptions["responseLimit"];
  /** Continuation metadata */
  parentAttemptId?: string;
  continuationNumber?: number;
  partialContent?: string;
  stepIndex?: number;
  totalSteps?: number;
  /** llama.cpp extended params (passthrough) */
  minP?: number;
  topK?: number;
  typicalP?: number;
  repeatPenalty?: number;
  dryMultiplier?: number;
  xtcProbability?: number;
  dynatempRange?: number;
  reasoningBudget?: number;
  stop?: string[];
}
