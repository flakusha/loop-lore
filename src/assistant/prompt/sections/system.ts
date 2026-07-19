/**
 * System prompt section — the top-level instruction override or the actor's
 * own system prompt.
 */
import type { SectionBuilder, } from "../types";

export const systemSection: SectionBuilder = {
  name: "system",
  enabled: (ctx,) => !!(ctx.params.systemPromptOverride ?? ctx.actor.system_prompt),
  build: (ctx,) => {
    const content = ctx.params.systemPromptOverride ?? ctx.actor.system_prompt ?? "";
    return content ? [{ role: "system", content, },] : [];
  },
};
