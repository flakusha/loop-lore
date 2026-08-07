import type { ContextMessage, TokenCountFn, } from "../context-window-config";
import { defaultTokenCount, } from "../context-window-config";
import type { CompressionMetadata, } from "./types";

// ── Token helpers ───────────────────────────────────────────

/** Count structural overhead per message (role + wrapping JSON) */
const STRUCTURAL_OVERHEAD_CHARS = 60;

/** Estimate tokens for a single message (role + content overhead). */
export function tokensForMessage(msg: ContextMessage, fn: TokenCountFn,): number {
  let text = msg.content;
  if (msg.name) { text += msg.name; }
  return fn(text,) + fn(String(STRUCTURAL_OVERHEAD_CHARS,),);
}

/** Sum token count across all messages */
export function calculateTotalTokens(
  messages: ContextMessage[],
  tokenCountFn: TokenCountFn = defaultTokenCount,
): number {
  let sum = 0;
  for (const msg of messages) { sum += tokensForMessage(msg, tokenCountFn,); }
  return sum;
}

export function zeroMetadata(tokens: number, count: number,): CompressionMetadata {
  return {
    originalTokens: tokens,
    compressedTokens: tokens,
    originalCount: count,
    compressedCount: count,
    systemCount: 0,
    conversationDropped: 0,
    conversationKept: count,
    budgetExceeded: false,
  };
}
