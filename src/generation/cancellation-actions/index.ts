/**
 * Generation Cancellation Actions
 *
 * Cancellation logic: user-initiated, auto-detected (repetition, policy),
 * and streaming chunk processing. Uses the tracker's in-memory data.
 *
 * Depends on: ./cancellation-tracker, ./repetition-detector, ./policy-detector, ./continuation
 */

// ── Cancellation by attempt / chat ────────────────────────
export {
  cancelGeneration,
  cancelGenerationByChat,
  getAbortSignal,
} from "./cancel";
export type {
  CancelGenerationByChatOpts,
  CancelGenerationOpts,
} from "./cancel";

// ── In-flight idempotency check ───────────────────────────
export { hasInFlightGeneration, } from "./inflight";

// ── Streaming chunk processing ────────────────────────────
export { processStreamingChunk, } from "./streaming";
export type { ProcessStreamingChunkOpts, } from "./streaming";

// ── Error type ────────────────────────────────────────────
export { GenerationCancelledError, } from "./error";
