/**
 * DB Schema — Generation Tables
 *
 * Generation attempt tracking for idempotency, cancellation, retry.
 */
import type { Generated } from "kysely";
import type { CancelReason, CancelSource, GenerationStatus } from "./enums";

// ── Generation Attempts ───────────────────────────────────────
export interface GenerationAttempts {
  id: Generated<string>;
  chat_id: string;
  parent_message_id: string;
  actor_id: string;
  idempotency_key: string;
  model_id: string;
  provider: string;
  status: GenerationStatus;
  cancel_reason: CancelReason | null;
  cancel_reason_detail: string | null;
  cancel_source: CancelSource | null;
  abort_signal_id: string | null;
  started_at: Generated<string>;
  completed_at: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  generation_time_ms: number | null;
  error_message: string | null;
  streaming_chunks_received: number | null;
  streaming_chars_received: number | null;
  repetition_score: number | null;
  repetition_analysis: string | null;
  policy_analysis: string | null;
  response_count_in_turn: number | null;
  parent_attempt_id: string | null;
  continuation_count: number | null;
  partial_content: string | null;
  step_index: number | null;
  total_steps: number | null;
  created_at: Generated<string>;
  updated_at: Generated<string>;
}
