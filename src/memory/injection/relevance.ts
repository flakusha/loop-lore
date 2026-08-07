/**
 * Memory context-relevance check.
 */
import type { MemoryEntry, } from "../types";
import type { InjectionContext, } from "./types";

/**
 * Check if a memory is contextually relevant to the current conversation.
 * Uses keyword overlap as a simple relevance signal.
 */
export function isContextRelevant(
  memory: MemoryEntry,
  ctx: InjectionContext,
): boolean {
  if (ctx.currentKeywords.length === 0 || memory.keywords.length === 0) {
    return false;
  }

  const memoryKeywords = new Set(Array.from(memory.keywords, (k,) => k.toLowerCase(),),);
  let overlap = 0;

  for (const keyword of ctx.currentKeywords) {
    if (memoryKeywords.has(keyword.toLowerCase(),)) {
      overlap++;
    }
  }

  // Relevant if at least 2 keywords overlap, or 20% of memory keywords match
  return overlap >= 2 || (memory.keywords.length > 0 && overlap / memory.keywords.length >= 0.2);
}
