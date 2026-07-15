/**
 * Post-history instructions section — actor-specific guidance appended after
 * the conversation history.
 */
import type { SectionBuilder } from "../types";

export const postHistorySection: SectionBuilder = {
  name: "postHistory",
  enabled: (ctx) => !!ctx.actor.post_history_instructions,
  build: (ctx) => {
    const instr = ctx.actor.post_history_instructions;
    if (!instr) return [];
    return [{ role: "system", content: `[Post-history instructions]\n${instr}` }];
  },
};
