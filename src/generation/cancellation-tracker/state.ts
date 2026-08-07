import { GenerationStatus, generationStatusMachine, } from "../../db/enums";
import type { getLogger, } from "../../logger";
import type { ActiveGeneration, } from "./types";

// ── In-memory generation tracking ─────────────────────────

/** Map of attemptId → ActiveGeneration — exported for step-pipeline.ts */
export const activeGenerations = new Map<string, ActiveGeneration>();

/** Map of chatId → attemptId for rapid chat-level lookup. @internal */
export const chatToAttempt = new Map<string, string>();

// ── Transition validation ─────────────────────────────────

interface TransitionOpts {
  active: ActiveGeneration;
  to: GenerationStatus;
  log: ReturnType<typeof getLogger>;
}

/**
 * Validate and apply a status transition on an active generation.
 * Logs a warning on invalid transitions but does not block (defensive).
 */
export function safeTransition({ active, to, log, }: TransitionOpts,): void {
  const from = active.status;
  if (!generationStatusMachine.canTransition(from, to,)) {
    log.warn("Invalid generation status transition", { from, to, attemptId: active.attemptId, },);
  }
  active.status = to;
}

// ── Status queries ─────────────────────────────────────────

/**
 * Check if a chat currently has an active generation.
 */
export function isChatGenerating(chatId: string,): boolean {
  // eslint-disable-next-line sonarjs/no-empty-collection
  const attemptId = chatToAttempt.get(chatId,);
  if (!attemptId) { return false; }
  // eslint-disable-next-line sonarjs/no-empty-collection
  const active = activeGenerations.get(attemptId,);
  return (
    active !== undefined &&
    active.status !== GenerationStatus.Cancelled &&
    active.status !== GenerationStatus.Completed
  );
}

/**
 * Get the attempt ID for an active chat generation, if any.
 */
export function getActiveAttemptId(chatId: string,): string | undefined {
  // eslint-disable-next-line sonarjs/no-empty-collection
  return chatToAttempt.get(chatId,);
}

/**
 * List all active generation attempts (for admin/debugging).
 */
export function listActiveGenerations(): {
  attemptId: string;
  chatId: string;
  actorId: string;
  status: GenerationStatus;
  elapsed: number;
  chunksReceived: number;
  charsReceived: number;
}[] {
  const now = Date.now();
  const result: ReturnType<typeof listActiveGenerations> = [];

  // eslint-disable-next-line sonarjs/no-empty-collection
  for (const [attemptId, active,] of activeGenerations) {
    result.push({
      attemptId,
      chatId: active.chatId,
      actorId: active.actorId,
      status: active.status,
      elapsed: now - active.startedAt,
      chunksReceived: active.chunksReceived,
      charsReceived: active.charsReceived,
    },);
  }

  return result;
}
