// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Generation Types — Options & Configuration
 *
 * Core option types for LLM generation requests and their
 * cancellation/policy/response-limit configurations.
 */

import type { Selectable, } from "kysely";
import { PolicyType, } from "../db/enums";
import type { GenerationAttempts, } from "../db/schema";

// ── DB-backed types ─────────────────────────────────────────
/** A fully resolved generation attempt row from the DB */
export type GenerationAttemptRow = Selectable<GenerationAttempts>;

// ── Core generation options ────────────────────────────────

export interface GenerationOptions {
  /** The chat ID this generation is for */
  chatId: string;
  /** The parent message ID (user message that triggered generation) */
  parentMessageId: string;
  /** The actor ID of the AI character generating the response */
  actorId: string;
  /** The model ID to use for generation */
  modelId: string;
  /** The provider (e.g., 'openai', 'anthropic', 'local') */
  provider: string;
  /** The prompt/messages to send to the LLM */
  prompt: string | GenerationMessage[];
  /** Generation parameters */
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  /** System prompt override */
  systemPrompt?: string;
  /** Whether to stream the response */
  stream?: boolean;
  /** Idempotency key for retry deduplication */
  idempotencyKey: string;
  /** Maximum characters to generate before auto-cancelling (optional) */
  maxChars?: number;
  /** Maximum tokens to generate before auto-cancelling (optional) */
  maxTokensHard?: number;
  /** Repetition detection configuration */
  repetitionDetection?: RepetitionDetectionConfig;
  /** Policy mismatch detection configuration */
  policyDetection?: PolicyDetectionConfig;
  /** Response count limit for group chats */
  responseLimit?: ResponseLimitConfig;
  /** Continuation: parent generation attempt ID being continued from */
  parentAttemptId?: string;
  /** Continuation: which continuation number this is (1-based) */
  continuationNumber?: number;
  /** Continuation: partial content to prepend as already-written context */
  partialContent?: string;
  /** Multi-step: the step index to start from (0 = full generation) */
  stepIndex?: number;
  /** Multi-step: total steps in the pipeline */
  totalSteps?: number;
  /** Whether this is a continuation generation */
  isContinuation?: boolean;
}

export interface GenerationMessage {
  role: "system" | "user" | "assistant" | "character" | "tool";
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
}

// ── Detection configuration interfaces ─────────────────────

export interface RepetitionDetectionConfig {
  /** Enable repetition detection */
  enabled: boolean;
  /** Minimum characters before checking */
  minChars: number;
  /** Maximum similarity score (0-1) before cancelling */
  maxSimilarity: number;
  /** Window size in characters for comparison */
  windowSize: number;
  /** Minimum number of repeated patterns to trigger */
  minRepetitions: number;
  /** Cancel immediately on detection or just flag */
  autoCancel: boolean;
}

export interface PolicyDetectionConfig {
  /** Enable policy mismatch detection */
  enabled: boolean;
  /** Chat/content policy type: 'sfw' | 'nsfw' | 'custom' */
  expectedPolicy: PolicyType;
  /** Custom policy description when expectedPolicy is 'custom' */
  customPolicy?: string;
  /** Cancel immediately on detection or just flag */
  autoCancel: boolean;
  /** Confidence threshold for detection (0-1) */
  confidenceThreshold: number;
}

export interface ResponseLimitConfig {
  /** Maximum number of AI responses per turn in group chats */
  maxResponsesPerTurn: number;
  /** Whether this is a group chat */
  isGroupChat: boolean;
  /** Cancel immediately when limit reached */
  autoCancel: boolean;
}

// ── Default Configurations ─────────────────────────────────

export const DEFAULT_REPETITION_DETECTION: RepetitionDetectionConfig = {
  enabled: true,
  minChars: 200,
  maxSimilarity: 0.85,
  windowSize: 100,
  minRepetitions: 3,
  autoCancel: true,
};

export const DEFAULT_POLICY_DETECTION: PolicyDetectionConfig = {
  enabled: true,
  expectedPolicy: PolicyType.Sfw,
  autoCancel: true,
  confidenceThreshold: 0.7,
};

export const DEFAULT_RESPONSE_LIMIT: ResponseLimitConfig = {
  maxResponsesPerTurn: 1,
  isGroupChat: false,
  autoCancel: true,
};
