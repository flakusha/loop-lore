/**
 * AUX Pipeline — Shared Types
 *
 * Shared contracts for the auxiliary LLM enrichment pipeline.
 * One policy for all AUX tasks: fast, cheap, focused, graceful.
 */
import type { ModelRole, } from "../db/enums-core";

/** Tasks that route through the shared AUX runner. */
export type AuxTaskName = "transition" | "intent" | "memory" | "nsfw" | "gm-tool";

/** Per-call options for `callAux`. All optional — runner defaults apply. */
export interface AuxCallOptions {
  /** Model role to resolve. Default: "auxiliary". */
  role?: ModelRole;
  /** Per-call timeout in ms. Default: 2000. */
  timeoutMs?: number;
  /** Temperature for deterministic classification. Default: 0.0. */
  temperature?: number;
  /** Max output tokens. Default: 100. */
  maxTokens?: number;
  /** User ID for BYO apiKey resolution (resolveProvider parity). */
  userId?: string;
  /** Chat ID for telemetry context. */
  chatId?: string;
}

/** Result of a successful AUX call. */
export interface AuxCallResult {
  content: string;
  model: string;
  provider: string;
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
}
