// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { DEFAULT_PROFILE_REGISTRY, } from "./profiles";
import { resolveTemplate, } from "./templates";
import type {
  DetailLevel,
  ImageModelProfile,
  ImageModelProfileRegistry,
  SdGenMode,
  TemplateContext,
} from "./types";

/** */
export interface ResolveProfileOptions {
  /** Model name string (e.g. "flux1-dev", "ponyDiffusionV6") */
  modelName?: string;
  /** Registry override (uses DEFAULT_PROFILE_REGISTRY if omitted) */
  registry?: ImageModelProfileRegistry;
  /** Explicit profile ID override */
  profileId?: string;
  /**
   * Per-character template overrides (JSON from actors.template_overrides).
   * Keys are `{mode}:{detail}` (e.g. "yourself:balanced") → template string.
   * Matched overrides replace the built-in template for that mode+detail combo.
   */
  characterOverrides?: Record<string, string>;
}

/** */
export interface ResolvedProfile {
  profile: ImageModelProfile;
  /** The template string for the given mode and detail level */
  template: string;
  /** The resolved model ID (profile.id) */
  resolvedProfileId: string;
}

/**
 * Resolve an image model profile by model name, profile ID, or default.
 * Returns the profile + the correct template for the given mode + detail.
 * @param mode
 * @param detail
 * @param opts
 */
export function resolveProfile(
  mode: SdGenMode,
  detail: DetailLevel,
  opts: ResolveProfileOptions = {},
): ResolvedProfile {
  const registry = opts.registry ?? DEFAULT_PROFILE_REGISTRY;
  const profiles = registry.profiles;

  let profileId = opts.profileId;

  if (!profileId && opts.modelName && registry.modelMatching) {
    const lower = opts.modelName.toLowerCase();
    for (const rule of registry.modelMatching) {
      if (lower.includes(rule.pattern,)) {
        profileId = rule.profileId;
        break;
      }
    }
  }

  if (!profileId || !profiles[profileId]) {
    profileId = registry.defaultProfileId;
  }

  const profile = profiles[profileId]!;

  const modeKey = mode === "raw_last" ? "last" : mode;
  const modeTemplates = profile.templates[detail] ?? profile.templates.balanced;
  const fallbackMode = modeKey === "free" ? "last" : modeKey;
  let template = modeTemplates[fallbackMode] ?? modeTemplates.yourself;

  // Apply per-character template overrides if present
  if (opts.characterOverrides) {
    const overrideKey = `${fallbackMode}:${detail}`;
    const override = opts.characterOverrides[overrideKey];
    if (override) {
      template = override;
    }
  }

  return { profile, template, resolvedProfileId: profileId, };
}

/**
 * Generate the full prompt by resolving the template and filling in context.
 * Shorthand: resolve + resolveTemplate in one call.
 * @param mode
 * @param detail
 * @param ctx
 * @param opts
 */
export function generatePrompt(
  mode: SdGenMode,
  detail: DetailLevel,
  ctx: TemplateContext,
  opts: ResolveProfileOptions = {},
): { prompt: string; profile: ImageModelProfile; resolvedProfileId: string } {
  const { profile, template, resolvedProfileId, } = resolveProfile(mode, detail, opts,);
  return {
    prompt: resolveTemplate(template, ctx,),
    profile,
    resolvedProfileId,
  };
}
