// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { SdProfileOverride, SdTemplateConfig, } from "../../config/sections/templates";
import { DEFAULT_PROFILE_REGISTRY, } from "./profiles";
import type {
  DetailLevel,
  ImageModelFamily,
  ImageModelProfile,
  ImageModelProfileRegistry,
  ImageModelTemplates,
  PromptFormat,
} from "./types";

/**
 * Convert a config SD profile override into a full ImageModelProfile.
 * Fills in missing template fields with empty strings.
 * @param override
 */
export function configProfileToImageModelProfile(
  override: SdProfileOverride,
): ImageModelProfile {
  const emptyTemplates: ImageModelTemplates = {
    yourself: "",
    face: "",
    me: "",
    scene: "",
    last: "",
    background: "",
  };

  const templates: Record<DetailLevel, ImageModelTemplates> = {
    instant: { ...emptyTemplates, ...override.templates?.instant, },
    balanced: { ...emptyTemplates, ...override.templates?.balanced, },
    detailed: { ...emptyTemplates, ...override.templates?.detailed, },
  };

  return {
    id: override.id,
    name: override.name,
    families: override.families as ImageModelFamily[],
    promptFormat: override.promptFormat as PromptFormat,
    maxTokenHint: override.maxTokenHint,
    defaults: override.defaults,
    templates,
  };
}

/**
 * Create an ImageModelProfileRegistry from config SD template configuration.
 * Config profiles are merged with built-in profiles; config wins on conflict.
 * @param sdConfig
 * @param base
 */
export function createConfigRegistry(
  sdConfig: SdTemplateConfig,
  base: ImageModelProfileRegistry = DEFAULT_PROFILE_REGISTRY,
): ImageModelProfileRegistry {
  const profiles = { ...base.profiles, };

  // Merge config profiles (config wins on key conflict)
  for (const [id, override,] of Object.entries(sdConfig.profiles,)) {
    profiles[id] = configProfileToImageModelProfile(override,);
  }

  // Merge model matching rules (config rules appended, first match wins)
  const modelMatching = [
    ...(base.modelMatching ?? []),
    ...(sdConfig.modelMatching ?? []),
  ];

  return {
    profiles,
    defaultProfileId: base.defaultProfileId,
    modelMatching,
  };
}
