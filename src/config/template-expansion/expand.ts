import type { AvatarTemplateConfig, } from "../sections/templates";
import type { ExpansionConfig, } from "./types.js";

// ── Expansion Logic ────────────────────────────────────────

/**
 * Expand avatar template config with additional entries.
 *
 * @param base - Base avatar config
 * @param expansion - Expansion config
 * @returns Expanded avatar config
 */
export function expandAvatarConfig(
  base: AvatarTemplateConfig,
  expansion: ExpansionConfig,
): AvatarTemplateConfig {
  const strategy = expansion.merge ?? "extend";

  if (strategy === "replace") {
    return {
      merge: "extend",
      emotions: expansion.emotions ?? {},
      intentPatterns: expansion.intentPatterns ?? [],
    };
  }

  if (strategy === "override") {
    return {
      ...base,
      merge: "extend",
      emotions: { ...base.emotions, ...expansion.emotions, },
      intentPatterns: expansion.intentPatterns ?? base.intentPatterns,
    };
  }

  // extend: add new entries, existing keys from base win on conflict
  const mergedEmotions = { ...base.emotions, };
  if (expansion.emotions) {
    for (const [key, value,] of Object.entries(expansion.emotions,)) {
      if (!Object.prototype.hasOwnProperty.call(mergedEmotions, key,)) {
        mergedEmotions[key] = value;
      }
    }
  }

  const mergedPatterns = [...base.intentPatterns,];
  if (expansion.intentPatterns) {
    for (const pattern of expansion.intentPatterns) {
      // Avoid duplicates
      const exists = mergedPatterns.some(
        (p,) => p.pattern === pattern.pattern && p.emotion === pattern.emotion,
      );
      if (!exists) {
        mergedPatterns.push(pattern,);
      }
    }
  }

  return {
    merge: "extend",
    emotions: mergedEmotions,
    intentPatterns: mergedPatterns,
  };
}

/**
 * Extract keywords from avatar emotions and intent patterns.
 */
export function extractKeywords(config: AvatarTemplateConfig,): string[] {
  const keywords = new Set<string>();

  // Extract from emotion intents
  for (const emotion of Object.values(config.emotions,)) {
    if (!emotion.intent) {
      continue;
    }

    // Extract key words from intent description
    const words = emotion.intent.toLowerCase().split(/\s+/,);
    for (const word of words) {
      if (word.length > 3) { // Only meaningful words
        keywords.add(word,);
      }
    }
  }

  // Extract from intent patterns
  for (const pattern of config.intentPatterns) {
    keywords.add(pattern.pattern.toLowerCase(),);
  }

  return Array.from(keywords,);
}

/**
 * Extract actions from avatar emotions.
 */
export function extractActions(config: AvatarTemplateConfig,): string[] {
  const actions = new Set<string>();

  // Action verbs associated with emotions
  const emotionActions: Record<string, string[]> = {
    happy: ["smile", "laugh", "grin", "cheer",],
    sad: ["cry", "weep", "frown", "sigh",],
    angry: ["shout", "yell", "scowl", "glare",],
    surprised: ["gasp", "stare", "jump", "freeze",],
    fearful: ["tremble", "shake", "cower", "flinch",],
    disgusted: ["recoil", "wince", "grimace", "sneer",],
    neutral: ["nod", "wait", "pause", "observe",],
    excited: ["jump", "clap", "cheer", "celebrate",],
    anxious: ["fidget", "pace", "wring", "sweat",],
    calm: ["breathe", "relax", "settle", "rest",],
    confused: ["tilt", "squint", "ponder", "wonder",],
    proud: ["stand", "raise", "beam", "glow",],
    shameful: ["hide", "lower", "shrink", "avoid",],
    loving: ["embrace", "hold", "caress", "gaze",],
    jealous: ["glare", "clench", "bite", "seethe",],
    grateful: ["thank", "appreciate", "bow", "nod",],
    bored: ["yawn", "slouch", "drift", "stare",],
  };

  for (const [emotion, emotionList,] of Object.entries(emotionActions,)) {
    if (emotion in config.emotions) {
      for (const action of emotionList) {
        actions.add(action,);
      }
    }
  }

  return Array.from(actions,);
}
