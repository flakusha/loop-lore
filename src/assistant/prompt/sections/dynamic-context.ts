/**
 * Dynamic context section — injects time-sensitive data as a separate
 * user-role message near the end of context.
 *
 * KV-cache rationale: the system prompt prefix should stay byte-identical
 * across turns so the model's KV-cache can reuse the cached prefix.
 * Placing dynamic content (date/time, counters) in a user message at the
 * end of context is the standard approach — the system prefix stays static,
 * only the tail changes each turn, minimizing compute on cache miss.
 */
import type { SectionBuilder, } from "../types";

export const dynamicContextSection: SectionBuilder = {
  name: "dynamicContext",
  enabled: () => true,
  build: async () => {
    const now = new Date();
    const dateStr = now.toISOString().split("T", 1,)[0] ?? "unknown";
    const timeStr = now.toTimeString().split(" ", 1,)[0] ?? "unknown";
    const content = `[Current date: ${dateStr} ${timeStr}]`;
    return [{ role: "user", content, },];
  },
};
