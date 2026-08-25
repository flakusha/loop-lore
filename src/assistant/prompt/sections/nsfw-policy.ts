// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NSFW Policy section — injects a content-rating policy as a system message
 * so the model writes within the chat's maximum allowed rating.
 *
 * Rating-aware: when NSFW is disallowed (`allowNsfw` false, or the runtime
 * admin toggle in `nsfwRuntimeConfig`), the SFW-only variant
 * (`nsfwPolicySfw`) is injected instead of the full taxonomy — the model gets
 * an explicit restriction rather than levels it must not use. Both texts are
 * config-driven via `resolveSystemPrompt` over `configs/templates/llm.yaml`.
 */
import { getRuntimeNsfwConfig, } from "../../../nsfw/runtime-config";
import { resolveSystemPrompt, } from "../../../prompts";
import { wrapSection, } from "../../xml-utils";
import type { SectionBuilder, } from "../types";

export const nsfwPolicySection: SectionBuilder = {
  name: "nsfwPolicy",
  enabled: (ctx,) => ctx.config?.nsfw.allowNsfw ?? true,
  build: (ctx,) => {
    const nsfwAllowed = (ctx.config?.nsfw.allowNsfw ?? true) &&
      getRuntimeNsfwConfig().allowNsfw;
    const policy = resolveSystemPrompt(
      ctx.config?.templates.llm,
      nsfwAllowed ? "nsfwPolicy" : "nsfwPolicySfw",
    );
    if (!policy) { return []; }
    return [{ role: "system", content: wrapSection("nsfw_policy", policy,), },];
  },
};
