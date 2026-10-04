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
  EntityTypePreset,
  MergeStrategy,
  TemplatesConfig,
} from "../sections/templates";
import { TEMPLATES_DEFAULTS, } from "../sections/templates";
import { findTemplateFiles, findWorkflowFiles, parseTemplateFile, } from "./discovery";
import {
  mergeAvatarConfig,
  mergeCharacterConfig,
  mergeImageEditConfig,
  mergeLlmConfig,
  mergeSdConfig,
  mergeWorkflowConfig,
} from "./merge";
import {
  validateAvatarConfig,
  validateCharacterConfig,
  validateEntityTypeConfig,
  validateEntityTypePresets,
  validateImageEditConfig,
  validateLlmConfig,
  validateSdConfig,
  validateWorkflowConfig,
  warnUnknownPromptPurposes,
} from "./validation";

/**
 * Load template configuration from configs/templates/ directory.
 *
 * Merges user-provided template files with built-in defaults
 * using per-domain merge strategies.
 *
 * Also loads character files from configs/characters/ directory.
 * @param cwd - Working directory to search from (default: process.cwd())
 * @returns Merged template configuration
 * @throws {Error}
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
    config.workflows = loadWorkflowFile(config.workflows, filePath,);
  }

  validateEntityTypePresets(config.workflows,);

  return config;
}

/**
 * Parse, validate and merge one `workflows/*.yaml` file into the workflow
 * domain. A file may carry an `entityTypes:` block (presets keyed by entity
 * kind) alongside its `workflows:` map; the block is routed to the preset
 * domain first so the workflow validator never sees it as a workflow id.
 * @param current
 * @param filePath
 * @returns WorkflowTemplateConfig
 */
function loadWorkflowFile(
  current: TemplatesConfig["workflows"],
  filePath: string,
): TemplatesConfig["workflows"] {
  try {
    const raw = parseTemplateFile(filePath,);
    const strategy = (raw.merge as MergeStrategy) ?? "extend";
    const { entityTypes, ...workflowRaw } = raw;
    const presets = entityTypes as Record<string, EntityTypePreset> | undefined;
    if (presets !== undefined) {
      validateEntityTypeConfig({ entityTypes: presets, },);
    }

    validateWorkflowConfig(workflowRaw as Record<string, unknown>,);
    const table = {
      ...(workflowRaw.workflows !== undefined
        ? workflowRaw.workflows as Record<string, unknown>
        : workflowRaw as Record<string, unknown>),
    };

    delete table.merge;
    return mergeWorkflowConfig(
      current,
      {
        workflows: table as unknown as Record<string, AssistantWorkflowConfig>,
        entityTypes: presets ?? {},
      },
      strategy,
    );
  } catch (error) {
    throw new Error(
      `Failed to load workflow template ${filePath}: ${(error as Error).message}`,
      { cause: error, },
    );
  }
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
  validateEntityTypeConfig,
  validateEntityTypePresets,
  validateImageEditConfig,
  validateLlmConfig,
  validateSdConfig,
  validateWorkflowConfig,
} from "./validation.js";
