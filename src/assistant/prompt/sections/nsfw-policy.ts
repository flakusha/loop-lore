/**
 * NSFW Policy section — injects the SFW/NSFW level taxonomy as a system
 * message so the model writes within the chat's maximum allowed rating.
 *
 * The policy text is config-driven: `resolveSystemPrompt(config.templates.llm,
 * "nsfwPolicy")` overlays a user override from `configs/templates/llm.yaml`
 * over the code default (`NSFW_POLICY_LEVELS_PROMPT`), the same resolution
 * path every other generation prompt uses. It is injected only when NSFW
 * content is allowed in the app config; when the config is absent (e.g. tests)
 * the code default is used and the section stays gated on `allowNsfw`.
 */
import { resolveSystemPrompt, } from "../../../prompts";
import { wrapSection, } from "../../xml-utils";
import type { SectionBuilder, } from "../types";

export const nsfwPolicySection: SectionBuilder = {
  name: "nsfwPolicy",
  enabled: (ctx,) => ctx.config?.nsfw.allowNsfw ?? true,
  build: (ctx,) => {
    const policy = resolveSystemPrompt(ctx.config?.templates.llm, "nsfwPolicy",);
    if (!policy) { return []; }
    return [{ role: "system", content: wrapSection("nsfw_policy", policy,), },];
  },
};
