import type { Kysely, } from "kysely";
import { GenerationStatus, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import type { GenerationOptions, } from "../types";
import type { UpdateAttemptStatusOpts, } from "./types";

// ── DB helpers ─────────────────────────────────────────────

/** @internal — exported for lifecycle/step-pipeline */
export async function insertAttempt(
  db: Kysely<DB>,
  options: GenerationOptions,
  attemptId: string,
  abortSignalId: string,
): Promise<void> {
  await db
    .insertInto("generation_attempts",)
    .values({
      id: attemptId,
      chat_id: options.chatId,
      parent_message_id: options.parentMessageId,
      actor_id: options.actorId,
      idempotency_key: options.idempotencyKey,
      model_id: options.modelId,
      provider: options.provider,
      status: GenerationStatus.Pending,
      abort_signal_id: abortSignalId,
      cancel_reason: null,
      cancel_reason_detail: null,
      cancel_source: null,
      started_at: new Date().toISOString(),
      completed_at: null,
      prompt_tokens: null,
      completion_tokens: null,
      total_tokens: null,
      generation_time_ms: null,
      error_message: null,
      streaming_chunks_received: null,
      streaming_chars_received: null,
      repetition_score: null,
      repetition_analysis: null,
      policy_analysis: null,
      response_count_in_turn: null,
      parent_attempt_id: options.parentAttemptId ?? null,
      continuation_count: options.continuationNumber ?? null,
      partial_content: options.partialContent ?? null,
      step_index: options.stepIndex ?? 0,
      total_steps: options.totalSteps ?? 1,
    },)
    .execute();
}

/** @internal — exported for step-pipeline.ts */
export async function updateAttemptStatus({
  db,
  attemptId,
  status,
  extra,
}: UpdateAttemptStatusOpts,): Promise<void> {
  const update: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (extra) {
    for (const [key, value,] of Object.entries(extra,)) {
      if (value !== undefined && value !== null) {
        update[key] = value;
      }
    }
  }

  await db.updateTable("generation_attempts",).set(update,).where("id", "=", attemptId,).execute();
}
