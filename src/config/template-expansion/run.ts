// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { getLogger, } from "../../logger";
import type { AvatarTemplateConfig, } from "../sections/templates";
import { findExpansionFile, parseExpansionFile, } from "./discovery.js";
import { expandAvatarConfig, } from "./expand.js";
import type { ExpansionResult, } from "./types.js";

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
