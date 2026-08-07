import type { Kysely, } from "kysely";
import type { GenerationStatus, PolicyType, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import type { StreamingRepetitionDetector, } from "../repetition-detector";
import type { GenerationEvents, GenerationOptions, GenerationResult, } from "../types";

// ── Option + data types ────────────────────────────────────

/** @internal — exported for step-pipeline.ts */
export interface ActiveGeneration {
  attemptId: string;
  chatId: string;
  parentMessageId: string;
  actorId: string;
  abortController: AbortController;
  startedAt: number;
  repetitionDetector: StreamingRepetitionDetector;
  policyConfig: { expectedPolicy: PolicyType; cancel: boolean };
  responseLimitConfig: { maxResponses: number; isGroupChat: boolean; currentCount: number };
  streaming: boolean;
  chunksReceived: number;
  charsReceived: number;
  status: GenerationStatus;
  events?: GenerationEvents;
  parentAttemptId?: string;
  continuationNumber?: number;
  isContinuation?: boolean;
  partialContent?: string;
  stepIndex: number;
  totalSteps: number;
}

export interface UpdateAttemptStatusOpts {
  db: Kysely<DB>;
  attemptId: string;
  status: GenerationStatus;
  extra?: Record<string, unknown>;
}

export interface StartGenerationTrackingOpts {
  options: GenerationOptions;
  db: Kysely<DB>;
  events?: GenerationEvents;
}

export interface CompleteGenerationOpts {
  attemptId: string;
  result: GenerationResult;
  db: Kysely<DB>;
}

export interface FailGenerationOpts {
  attemptId: string;
  error: Error;
  db: Kysely<DB>;
}
