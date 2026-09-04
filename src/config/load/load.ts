// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/load/load.ts — Config load pipeline

import { readFileSync, } from "node:fs";
import path from "node:path";
import { findMainRepoRoot, } from "../../utils/git-worktree";
import type { Config, } from "../schema";
import { createConfigSchema, validate, } from "../schema-class";
import { runTemplateExpansion, } from "../template-expansion";
import { loadTemplateConfig, } from "../templates-loader";
import { DEFAULT_CONFIG_FILES, ENV_MAP, LOCAL_CONFIG_FILES, } from "./constants";
import { loadDomainConfigs, } from "./domain";
import { applyEnvironmentOverrides, applyProviderEnvVars, } from "./env";
import { findConfigFile, firstExisting, } from "./fs";
import { deepMerge, parseFileContent, } from "./parse";
import { validateAuthSafety, validateDatabaseSafety, } from "./safety";

/**
 * @param config
 */
export function validateConfig(config: Config,): void {
  validate(config,);
}

/**
 * @param cwd
 */
export function loadConfig(cwd?: string,): Config {
  const directory = cwd ?? process.cwd();
  const mainRoot = findMainRepoRoot(directory,);
  let config: Config = structuredClone(createConfigSchema().defaults,);

  // 1. Load config.default.* if present — team-shared defaults (committed to git)
  //    Priority: .yaml > .yml > .toml (first found wins)
  const defaultFound = findConfigFile(directory, DEFAULT_CONFIG_FILES,);
  if (defaultFound) {
    try {
      const content = readFileSync(defaultFound.path, "utf8",);
      const parsed = parseFileContent(content, defaultFound.ext,);
      config = deepMerge(config as unknown as Record<string, unknown>, parsed,) as unknown as Config;
    } catch (error) {
      throw new Error(`Failed to parse config file ${defaultFound.path}: ${(error as Error).message}`, {
        cause: error,
      },);
    }
  }

  // 2. Load main config file (config.yaml / config.yml / config.toml)
  //    Priority: .yaml > .yml > .toml (first found wins)
  const mainFound = findConfigFile(directory,);
  if (mainFound) {
    try {
      const content = readFileSync(mainFound.path, "utf8",);
      const parsed = parseFileContent(content, mainFound.ext,);
      config = deepMerge(config as unknown as Record<string, unknown>, parsed,) as unknown as Config;
    } catch (error) {
      throw new Error(`Failed to parse config file ${mainFound.path}: ${(error as Error).message}`, {
        cause: error,
      },);
    }
  }

  // 2.5. Load domain-specific config files (config.<domain>.yaml/yml/toml)
  //      These override the main config per domain.
  config = loadDomainConfigs(directory, config,);

  // 3. Load config.local.* if present — per-developer overrides (gitignored)
  //    Priority: .yaml > .yml > .toml (first found wins)
  const localFound = findConfigFile(directory, LOCAL_CONFIG_FILES,);
  if (localFound) {
    try {
      const content = readFileSync(localFound.path, "utf8",);
      const parsed = parseFileContent(content, localFound.ext,);
      config = deepMerge(config as unknown as Record<string, unknown>, parsed,) as unknown as Config;
    } catch (error) {
      throw new Error(`Failed to parse config file ${localFound.path}: ${(error as Error).message}`, {
        cause: error,
      },);
    }
  }

  // 4. Load env config if present — overrides config file values
  //    YAML takes priority over TOML (if both exist, YAML wins).
  //    Also check main repo root when running in a worktree.
  const envConfigCandidates = [
    path.join(directory, "env.yaml",),
    path.join(directory, "configs", "env.yaml",),
    path.join(directory, "env.toml",),
    path.join(directory, "configs", "env.toml",),
  ];
  if (mainRoot && mainRoot !== directory) {
    envConfigCandidates.push(
      path.join(mainRoot, "env.yaml",),
      path.join(mainRoot, "configs", "env.yaml",),
      path.join(mainRoot, "env.toml",),
      path.join(mainRoot, "configs", "env.toml",),
    );
  }
  const envConfigPath = firstExisting(envConfigCandidates,);
  if (envConfigPath) {
    const ext = envConfigPath.split(".",).pop() as string;
    try {
      const content = readFileSync(envConfigPath, "utf8",);
      const parsed = parseFileContent(content, ext,);
      config = deepMerge(config as unknown as Record<string, unknown>, parsed,) as unknown as Config;
    } catch (error) {
      throw new Error(`Failed to parse ${envConfigPath}: ${(error as Error).message}`, {
        cause: error,
      },);
    }
  }

  // 5. Apply env var overrides — highest priority
  config = applyEnvironmentOverrides(config, ENV_MAP,);
  applyProviderEnvVars(config,);

  // 6. Load template configs from configs/templates/ directory
  config.templates = loadTemplateConfig(directory,);

  // 6.5. Run template expansion to extend base configs
  const expansionResult = runTemplateExpansion(directory, config.templates.avatar,);
  config.templates.avatar = expansionResult.config;

  // 7. Backward compat: wrap single sd provider object in array
  const sd = config.generation.providers.sd;
  if (sd && !Array.isArray(sd,)) {
    config.generation.providers.sd = [sd,];
  }

  validateConfig(config,);
  validateDatabaseSafety(config,);
  validateAuthSafety(config,);
  return config;
}
