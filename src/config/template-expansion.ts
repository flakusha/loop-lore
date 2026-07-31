/**
 * Template Expansion Service
 *
 * Runs at application startup to expand base template configs with:
 * - Additional keywords, actions, emotions
 * - Emotion avatar variants (generated via SD if not present)
 *
 * Supports config-driven expansion via configs/templates/ YAML files.
 */

import { load as parseYaml, } from "js-yaml";
import { existsSync, readFileSync, statSync, } from "node:fs";
import path from "node:path";
import { parse as parseToml, } from "smol-toml";
import { getLogger, } from "../logger";
import type { AvatarTemplateConfig, EmotionEntry, MergeStrategy, } from "./sections/templates";

// ── Types ──────────────────────────────────────────────────

/** Expansion configuration for a single domain */
export interface ExpansionConfig {
  /** Merge strategy for this expansion */
  merge: MergeStrategy;
  /** Additional keywords to add */
  keywords?: string[];
  /** Additional actions to add */
  actions?: string[];
  /** Additional emotions to add */
  emotions?: Record<string, EmotionEntry>;
  /** Additional intent patterns to add */
  intentPatterns?: Array<{ pattern: string; emotion: string }>;
  /** Whether to auto-generate missing emotion avatars via SD */
  generateMissingAvatars?: boolean;
}

/** Result of template expansion */
export interface ExpansionResult {
  /** Keywords added */
  keywordsAdded: string[];
  /** Actions added */
  actionsAdded: string[];
  /** Emotions added */
  emotionsAdded: string[];
  /** Intent patterns added */
  patternsAdded: number;
  /** Avatars generated */
  avatarsGenerated: number;
  /** Errors encountered */
  errors: string[];
}

// ── File Discovery ─────────────────────────────────────────

/** Expansion file names */
const EXPANSION_FILES = [
  "expansion.yaml",
  "expansion.yml",
  "expansion.toml",
];

/**
 * Find expansion config file in search directories.
 */
function findExpansionFile(cwd: string,): string | null {
  const searchDirs = [
    path.join(cwd, "configs", "templates",),
    path.join(cwd, "templates",),
  ];

  for (const dir of searchDirs) {
    if (!existsSync(dir,) || !statSync(dir,).isDirectory()) { continue; }

    for (const filename of EXPANSION_FILES) {
      const fullPath = path.join(dir, filename,);
      if (existsSync(fullPath,)) {
        return fullPath;
      }
    }
  }

  return null;
}

/**
 * Parse expansion config file (YAML or TOML).
 */
function parseExpansionFile(filePath: string,): ExpansionConfig {
  const content = readFileSync(filePath, "utf8",);
  const ext = path.extname(filePath,).slice(1,);

  if (ext === "toml") {
    return parseToml(content,) as unknown as ExpansionConfig;
  }
  return parseYaml(content,) as ExpansionConfig;
}

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
    if (emotion.intent) {
      // Extract key words from intent description
      const words = emotion.intent.toLowerCase().split(/\s+/,);
      for (const word of words) {
        if (word.length > 3) { // Only meaningful words
          keywords.add(word,);
        }
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

/**
 * Check which emotions are missing avatar assets.
 */
export function findMissingAvatars(config: AvatarTemplateConfig,): string[] {
  const missing: string[] = [];

  for (const [key, emotion,] of Object.entries(config.emotions,)) {
    if (!emotion.asset || emotion.asset === "") {
      missing.push(key,);
    }
  }

  return missing;
}

/**
 * Run template expansion at startup.
 *
 * @param cwd - Working directory
 * @param avatarConfig - Current avatar config to expand
 * @returns Expansion result
 */
export function runTemplateExpansion(
  cwd: string,
  avatarConfig: AvatarTemplateConfig,
): { config: AvatarTemplateConfig; result: ExpansionResult } {
  const log = getLogger();
  const result: ExpansionResult = {
    keywordsAdded: [],
    actionsAdded: [],
    emotionsAdded: [],
    patternsAdded: 0,
    avatarsGenerated: 0,
    errors: [],
  };

  // Find expansion file
  const expansionPath = findExpansionFile(cwd,);
  if (!expansionPath) {
    log.debug("No expansion config found, using base config",);
    return { config: avatarConfig, result, };
  }

  log.info(`Loading expansion config from ${expansionPath}`,);

  try {
    const expansion = parseExpansionFile(expansionPath,);

    // Expand avatar config
    const expandedConfig = expandAvatarConfig(avatarConfig, expansion,);

    // Track additions
    if (expansion.keywords) {
      result.keywordsAdded = expansion.keywords;
    }
    if (expansion.actions) {
      result.actionsAdded = expansion.actions;
    }
    if (expansion.emotions) {
      result.emotionsAdded = Object.keys(expansion.emotions,);
    }
    if (expansion.intentPatterns) {
      result.patternsAdded = expansion.intentPatterns.length;
    }

    // Find missing avatars if auto-generation is enabled
    if (expansion.generateMissingAvatars) {
      const missing = findMissingAvatars(expandedConfig,);
      if (missing.length > 0) {
        log.info(`Found ${missing.length} emotions with missing avatars`, { emotions: missing, },);
        // TODO: Generate missing avatars via SD
        // This would be implemented when SD integration is complete
        result.avatarsGenerated = 0;
      }
    }

    log.info("Template expansion completed", {
      keywordsAdded: result.keywordsAdded.length,
      actionsAdded: result.actionsAdded.length,
      emotionsAdded: result.emotionsAdded.length,
      patternsAdded: result.patternsAdded,
    },);

    return { config: expandedConfig, result, };
  } catch (error) {
    const msg = `Failed to process expansion config: ${(error as Error).message}`;
    log.error(msg,);
    result.errors.push(msg,);
    return { config: avatarConfig, result, };
  }
}

/**
 * Validate expanded template config.
 *
 * @param config - Config to validate
 * @returns Validation errors (empty if valid)
 */
export function validateExpansionConfig(config: AvatarTemplateConfig,): string[] {
  const errors: string[] = [];

  // Check for duplicate intent patterns
  const patterns = new Map<string, string[]>();
  for (const pattern of config.intentPatterns) {
    const key = `${pattern.pattern}:${pattern.emotion}`;
    if (!patterns.has(key,)) {
      patterns.set(key, [],);
    }
    patterns.get(key,)!.push(pattern.pattern,);
  }

  for (const [key, occurrences,] of patterns) {
    if (occurrences.length > 1) {
      errors.push(`Duplicate intent pattern: ${key}`,);
    }
  }

  // Check for missing emotion references
  for (const pattern of config.intentPatterns) {
    if (!Object.prototype.hasOwnProperty.call(config.emotions, pattern.emotion,)) {
      errors.push(`Intent pattern references unknown emotion: ${pattern.emotion}`,);
    }
  }

  // Check for empty emotion keys
  for (const [key, emotion,] of Object.entries(config.emotions,)) {
    if (!key || key.trim() === "") {
      errors.push("Empty emotion key found",);
    }
    if (!emotion.intent || emotion.intent.trim() === "") {
      errors.push(`Emotion "${key}" has empty intent`,);
    }
  }

  return errors;
}
