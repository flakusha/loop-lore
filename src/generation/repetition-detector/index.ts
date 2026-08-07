/**
 * Repetition Detection Service
 *
 * Detects repetitive patterns in streaming LLM output to identify
 * loops and bot-like repetition. Uses n-gram fingerprinting and
 * sliding window similarity comparison.
 *
 * Split into domain modules: analyze (entry), ngrams (fingerprinting),
 * score (weighting), streaming (accumulator), theatrical (loop heuristic).
 */

// ── Analysis entry ─────────────────────────────────────────
export { analyzeRepetition, } from "./analyze";

// ── Streaming accumulator ──────────────────────────────────
export { StreamingRepetitionDetector, } from "./streaming";

// ── Theatrical loop heuristic ──────────────────────────────
export { detectTheatricalLoop, } from "./theatrical";
