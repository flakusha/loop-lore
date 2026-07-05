/**
 * Step Pipeline Tracking
 *
 * Tracks multi-step generation pipelines (text→image→caption, etc.).
 * Enables retry-from-point: resume from the failed step instead of restarting.
 *
 * Depends on cancellation-manager for in-memory generation tracking.
 */

import type { Kysely } from "kysely";
import type { DB } from "../db/schema";
import { GenerationStatus } from "../db/enums";
import { getLogger } from "../logger";

// ── Internal: shared state with cancellation-tracker ──────────
// These are marked @internal in cancellation-tracker and are NOT
// re-exported through the public cannon-barrel. Import directly.

import { activeGenerations, updateAttemptStatus } from "./cancellation-tracker";

/**
 * Mark a step as completed in a multi-step generation pipeline.
 * Advances the step index so retry-from-point resumes from the next step.
 *
 * @param attemptId — the generation attempt ID
 * @param stepIndex — the step index that completed (0-based)
 * @param db — Kysely DB instance for persistence
 */
export async function completeStep(attemptId: string, stepIndex: number, db: Kysely<DB>): Promise<void> {
  const active = activeGenerations.get(attemptId);
  if (!active) return;

  // Advance step index
  active.stepIndex = stepIndex + 1;

  try {
    await updateAttemptStatus(db, attemptId, active.status, {
      step_index: active.stepIndex,
    });
  } catch (error: unknown) {
    getLogger()
      .child({ module: "generation" })
      .warn("Non-fatal error in completeStep", { error: String(error) });
  }
}

/**
 * Mark a step as failed, storing error context for retry-from-point.
 *
 * @param attemptId — the generation attempt ID
 * @param stepIndex — the step index that failed (0-based)
 * @param error — the error that caused failure
 * @param db — Kysely DB instance for persistence
 */
export async function failStep(
  attemptId: string,
  stepIndex: number,
  error: Error,
  db: Kysely<DB>,
): Promise<void> {
  try {
    await updateAttemptStatus(db, attemptId, GenerationStatus.Failed, {
      error_message: `Step ${stepIndex} failed: ${error.message}`,
      step_index: stepIndex,
      completed_at: new Date().toISOString(),
    });
  } catch (updateError: unknown) {
    getLogger()
      .child({ module: "generation" })
      .warn("Non-fatal error in failStep", { error: String(updateError) });
  }
}

export interface PipelineState {
  stepIndex: number;
  totalSteps: number;
  status: GenerationStatus;
}

/**
 * Get the current pipeline state for a generation attempt.
 * Checks in-memory tracking first, falls back to DB.
 *
 * @param attemptId — the generation attempt ID
 * @param db — Kysely DB instance for fallback lookup
 * @returns pipeline state, or null if attempt not found
 */
export async function getPipelineState(attemptId: string, db: Kysely<DB>): Promise<PipelineState | null> {
  // Check in-memory first
  const active = activeGenerations.get(attemptId);
  if (active) {
    return {
      stepIndex: active.stepIndex,
      totalSteps: active.totalSteps,
      status: active.status,
    };
  }

  // Fall back to DB
  const attempt = await db
    .selectFrom("generation_attempts")
    .select("step_index")
    .select("total_steps")
    .select("status")
    .where("id", "=", attemptId)
    .executeTakeFirst();

  if (!attempt) return null;

  return {
    stepIndex: attempt.step_index ?? 0,
    totalSteps: attempt.total_steps ?? 1,
    status: attempt.status,
  };
}
