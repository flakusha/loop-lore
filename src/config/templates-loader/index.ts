// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/templates-loader — Template config file loader
//
// Finds and loads template config files (YAML or TOML) from configs/templates/ directory.
// YAML takes priority over TOML (if both exist, YAML wins).
// Applies per-domain merge strategies (replace, extend, override).

import { loadCharacterFiles, } from "../character-loader";
import type {
  AssistantWorkflowConfig,
  MergeStrategy,
  TemplatesConfig,
} from "../sections/templates";
import { TEMPLATES_DEFAULTS, } from "../sections/templates";
import { findTemplateFiles, findWorkflowFiles, parseTemplateFile, } from "./discovery.js";
import {
  mergeAvatarConfig,
  mergeCharacterConfig,
  mergeImageEditConfig,
  mergeLlmConfig,
  mergeSdConfig,
  mergeWorkflowConfig,
} from "./merge.js";
import {
  validateAvatarConfig,
  validateCharacterConfig,
  validateImageEditConfig,
  validateLlmConfig,
  validateSdConfig,
  validateWorkflowConfig,
  warnUnknownPromptPurposes,
} from "./validation.js";

/**
 * Load template configuration from configs/templates/ directory.
 *
 * Merges user-provided template files with built-in defaults
 * using per-domain merge strategies.
 *
 * Also loads character files from configs/characters/ directory.
 * @param cwd - Working directory to search from (default: process.cwd())
 * @returns Merged template configuration
 */
export function loadTemplateConfig(cwd?: string,): TemplatesConfig {
  const directory = cwd ?? process.cwd();
  const templateFiles = findTemplateFiles(directory,);

  const config: TemplatesConfig = structuredClone(TEMPLATES_DEFAULTS,);

  // Load character files from configs/characters/ directory
  const characterFiles = loadCharacterFiles(directory,);
  if (characterFiles.length > 0) {
    config.character.templates = characterFiles;
  }

  // Process each found template file
  for (const [domain, filePath,] of templateFiles) {
    try {
      const raw = parseTemplateFile(filePath,);
      const strategy = (raw.merge as MergeStrategy) ?? "extend";

      switch (domain) {
        case "llm": {
          // Fail fast on malformed llm config before merging.
          validateLlmConfig(raw,);
          warnUnknownPromptPurposes(raw.systemPrompts,);
          config.llm = mergeLlmConfig(
            config.llm,
            raw,
            strategy,
          );
          break;
        }
        case "sd": {
          validateSdConfig(raw,);
          config.sd = mergeSdConfig(
            config.sd,
            raw,
            strategy,
          );
          break;
        }
        case "avatar": {
          validateAvatarConfig(raw,);
          config.avatar = mergeAvatarConfig(
            config.avatar,
            raw,
            strategy,
          );
          break;
        }
        case "imageEdit": {
          validateImageEditConfig(raw,);
          config.imageEdit = mergeImageEditConfig(
            config.imageEdit,
            raw,
            strategy,
          );
          break;
        }
        case "character": {
          validateCharacterConfig(raw,);
          config.character = mergeCharacterConfig(
            config.character,
            raw,
            strategy,
          );
          break;
        }
      }
    } catch (error) {
      throw new Error(
        `Failed to load template config ${filePath}: ${(error as Error).message}`,
        { cause: error, },
      );
    }
  }

  // Assistant workflow templates: multi-file workflows/*.yaml, merged in
  // discovery order (defaults first, user overrides layer over them).
  for (const filePath of findWorkflowFiles(directory,)) {
    try {
      const raw = parseTemplateFile(filePath,);
      const strategy = (raw.merge as MergeStrategy) ?? "extend";
      validateWorkflowConfig(raw,);
      const table = {
        ...((raw.workflows !== undefined ? raw.workflows : raw) as Record<string, unknown>),
      };
      delete table.merge;
      config.workflows = mergeWorkflowConfig(
        config.workflows,
        { workflows: table as unknown as Record<string, AssistantWorkflowConfig>, },
        strategy,
      );
    } catch (error) {
      throw new Error(
        `Failed to load workflow template ${filePath}: ${(error as Error).message}`,
        { cause: error, },
      );
    }
  }

  return config;
}

export {
  findTemplateFiles,
  findWorkflowFiles,
  TEMPLATE_FILES,
} from "./discovery.js";
export {
  mergeAvatarConfig,
  mergeCharacterConfig,
  mergeImageEditConfig,
  mergeLlmConfig,
  mergeSdConfig,
  mergeWorkflowConfig,
} from "./merge.js";
export {
  validateAvatarConfig,
  validateCharacterConfig,
  validateImageEditConfig,
  validateLlmConfig,
  validateSdConfig,
  validateWorkflowConfig,
} from "./validation.js";
