/**
 * Post-history instructions section — actor-specific guidance appended after
 * the conversation history.
 */
import type { SectionBuilder } from "../types";
import { wrapSection } from "../../xml-utils";

export const postHistorySection: SectionBuilder = {
  name: "postHistory",
  enabled: (ctx) => !!ctx.actor.post_history_instructions,
  build: (ctx) => {
    const instr = ctx.actor.post_history_instructions;
    if (!instr) return [];
    return [{ role: "system", content: wrapSection("post_history", instr) }];
  },
};
