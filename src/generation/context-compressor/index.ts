/**
 * Context Compressor
 *
 * Standalone sliding window + budget enforcement for LLM prompts.
 * Pure functions — no DB imports, no generation module imports.
 * Truncation-only MVP: summarization via SummarizeFn callback.
 *
 * Split into domain modules: compress (entry), strategies (window/truncate),
 * tokens (token accounting), split (system/conversation), types.
 */

// ── Public API ─────────────────────────────────────────────
export { compressMessages, } from "./compress";
export { calculateTotalTokens, } from "./tokens";

export type {
  CompressionMetadata,
  CompressionResult,
  CompressMessagesOpts,
} from "./types";
