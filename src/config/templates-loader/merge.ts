// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type {
  AvatarTemplateConfig,
  CharacterTemplateConfig,
  ImageEditTemplateConfig,
  LlmTemplateConfig,
  MergeStrategy,
  SdTemplateConfig,
} from "../sections/templates";

// ── Merge Strategies ────────────────────────────────────────
//
// Canonical semantics (shared by every template domain):
//   - replace:  base is discarded — only override values are kept
//   - override: shallow merge per key — override wins on conflict,
//               base fills gaps (maps merged per-entry)
//   - extend:   additive — existing keys keep their base value,
//               new keys from override are added (lists append with dedup)

/** Apply merge strategy for LLM templates */
export function mergeLlmConfig(
  base: LlmTemplateConfig,
  override: Partial<LlmTemplateConfig>,
  strategy: MergeStrategy,
): LlmTemplateConfig {
  if (strategy === "replace") {
    return {
      merge: base.merge,
      systemPrompts: override.systemPrompts ?? {},
      chatFormats: override.chatFormats ?? {},
    };
  }

  if (strategy === "override") {
    return {
      ...base,
      ...override,
      merge: base.merge,
      systemPrompts: { ...base.systemPrompts, ...override.systemPrompts, },
      chatFormats: { ...base.chatFormats, ...override.chatFormats, },
    };
  }

  // extend: existing prompts/formats keep base values, new ones are added
  return {
    merge: base.merge,
    systemPrompts: { ...override.systemPrompts, ...base.systemPrompts, },
    chatFormats: { ...override.chatFormats, ...base.chatFormats, },
  };
}

/** Apply merge strategy for SD templates */
export function mergeSdConfig(
  base: SdTemplateConfig,
  override: Partial<SdTemplateConfig>,
  strategy: MergeStrategy,
): SdTemplateConfig {
  if (strategy === "replace") {
    return {
      merge: base.merge,
      profiles: override.profiles ?? {},
      modelMatching: override.modelMatching ?? [],
    };
  }

  if (strategy === "override") {
    return {
      ...base,
      ...override,
      merge: base.merge,
      profiles: { ...base.profiles, ...override.profiles, },
      modelMatching: override.modelMatching ?? base.modelMatching,
    };
  }

  // extend: existing profiles keep base values, new ones are added;
  // model-matching rules accumulate (appended).
  return {
    merge: base.merge,
    profiles: { ...override.profiles, ...base.profiles, },
    modelMatching: [...base.modelMatching, ...(override.modelMatching ?? []),],
  };
}

/** Apply merge strategy for avatar templates */
export function mergeAvatarConfig(
  base: AvatarTemplateConfig,
  override: Partial<AvatarTemplateConfig>,
  strategy: MergeStrategy,
): AvatarTemplateConfig {
  if (strategy === "replace") {
    return {
      merge: base.merge,
      emotions: override.emotions ?? {},
      intentPatterns: override.intentPatterns ?? [],
    };
  }

  if (strategy === "override") {
    return {
      ...base,
      ...override,
      merge: base.merge,
      emotions: { ...base.emotions, ...override.emotions, },
      intentPatterns: override.intentPatterns ?? base.intentPatterns,
    };
  }

  // extend: consensus semantics shared with expandAvatarConfig —
  // base emotions win on key conflicts; intent patterns are appended with
  // (pattern, emotion) dedup so repeated overrides don't duplicate entries.
  const mergedEmotions = { ...base.emotions, };
  if (override.emotions) {
    for (const [key, value,] of Object.entries(override.emotions,)) {
      if (!Object.prototype.hasOwnProperty.call(mergedEmotions, key,)) {
        mergedEmotions[key] = value;
      }
    }
  }
  const mergedPatterns = [...base.intentPatterns,];
  if (override.intentPatterns) {
    for (const pattern of override.intentPatterns) {
      if (mergedPatterns.every((p,) => p.pattern !== pattern.pattern || p.emotion !== pattern.emotion)) {
        mergedPatterns.push(pattern,);
      }
    }
  }
  return {
    merge: base.merge,
    emotions: mergedEmotions,
    intentPatterns: mergedPatterns,
  };
}

/** Apply merge strategy for image-edit templates */
export function mergeImageEditConfig(
  base: ImageEditTemplateConfig,
  override: Partial<ImageEditTemplateConfig>,
  strategy: MergeStrategy,
): ImageEditTemplateConfig {
  if (strategy === "replace") {
    return {
      merge: base.merge,
      workflows: override.workflows ?? {},
    };
  }

  if (strategy === "override") {
    return {
      ...base,
      ...override,
      merge: base.merge,
      workflows: { ...base.workflows, ...override.workflows, },
    };
  }

  // extend: existing workflows keep base values, new ones are added
  return {
    merge: base.merge,
    workflows: { ...override.workflows, ...base.workflows, },
  };
}

/** Apply merge strategy for character templates */
export function mergeCharacterConfig(
  base: CharacterTemplateConfig,
  override: Partial<CharacterTemplateConfig>,
  strategy: MergeStrategy,
): CharacterTemplateConfig {
  if (strategy === "replace") {
    return {
      merge: base.merge,
      templates: override.templates ?? [],
    };
  }

  if (strategy === "override") {
    // Override: user templates replace built-in by name
    const merged = new Map<string, CharacterTemplateConfig["templates"][number]>();
    for (const t of base.templates) {
      merged.set(t.name.toLowerCase(), t,);
    }
    const overrideTemplates = override.templates ?? [];
    for (const t of overrideTemplates) {
      merged.set(t.name.toLowerCase(), t,);
    }
    return {
      ...base,
      ...override,
      merge: base.merge,
      templates: Array.from(merged.values(),),
    };
  }

  // extend: existing templates keep base versions; only new names are added
  const merged = new Map<string, CharacterTemplateConfig["templates"][number]>();
  for (const t of base.templates) {
    merged.set(t.name.toLowerCase(), t,);
  }
  const overrideTemplates = override.templates ?? [];
  for (const t of overrideTemplates) {
    const key = t.name.toLowerCase();
    if (!merged.has(key,)) {
      merged.set(key, t,);
    }
  }
  return {
    merge: base.merge,
    templates: Array.from(merged.values(),),
  };
}
