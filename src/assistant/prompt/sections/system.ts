/**
 * System prompt section — the top-level instruction override, the config-
 * driven default, or the actor's own system prompt (in that priority order).
 */
import type { SectionBuilder, } from "../types";

export const systemSection: SectionBuilder = {
  name: "system",
  enabled: (ctx,) =>
    !!(
      ctx.params.systemPromptOverride ??
        ctx.params.systemPromptFallback ??
        ctx.actor.system_prompt
    ),
  build: (ctx,) => {
    const content = ctx.params.systemPromptOverride ??
      ctx.params.systemPromptFallback ??
      ctx.actor.system_prompt ??
      "";
    return content ? [{ role: "system", content, },] : [];
  },
};
