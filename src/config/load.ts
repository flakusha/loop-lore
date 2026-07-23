// src/config/load.ts — Config file loader with env override

import { load as parseYaml, } from "js-yaml";
import { existsSync, readFileSync, statSync, } from "node:fs";
import path from "node:path";
import { parse as parseToml, } from "smol-toml";
import { type Config, } from "./schema";
import type { ProviderInstanceConfig, } from "./schema";
import { ConfigSchema, } from "./schema-class";

// Map flat env var names to dot-separated config paths
// Source of truth: ConfigSchema.envMap() — auto-generated from class hierarchy.
const ENV_MAP: Record<string, string> = ConfigSchema.envMap();

/** Env var check helper — detects when LLM_PROVIDER_* env vars are set */

// Config file candidates in priority order
const CONFIG_FILES = ["config.yaml", "config.yml", "config.toml",];

// Optional config layers (merged in order, each overriding the previous):
//   config.default.* → team-shared defaults (committed to git)
//   config.local.*   → per-developer overrides (gitignored)
const DEFAULT_CONFIG_FILES = ["config.default.yaml", "config.default.yml", "config.default.toml",];
const LOCAL_CONFIG_FILES = ["config.local.yaml", "config.local.yml", "config.local.toml",];

function deepMerge<T extends Record<string, unknown>,>(base: T, overrides: Partial<T>,): T {
  const result = { ...base, };
  for (const key of Object.keys(overrides,)) {
    const k = key as keyof T;
    const value = overrides[k];
    if (value !== undefined) {
      const baseValue = base[k];
      const isObject = typeof value === "object" &&
        !Array.isArray(value,) &&
        typeof baseValue === "object" &&
        baseValue != null;
      result[k] = isObject
        ? (deepMerge(baseValue as Record<string, unknown>, value as Record<string, unknown>,) as T[keyof T])
        : (value as T[keyof T]);
    }
  }
  return result;
}

function setByPath(object: Record<string, unknown>, path: string, value: unknown,): void {
  const parts = path.split(".",);
  let current = object;
  for (let index = 0; index < parts.length - 1; index++) {
    const part = parts[index];
    if (!Object.hasOwn(current, part!,) || typeof current[part!] !== "object") {
      current[part!] = {};
    }
    current = current[part!] as Record<string, unknown>;
  }
  current[parts.at(-1,) as string] = value;
}

function coerceValue(value: string, targetType: string,): unknown {
  if (targetType === "number") { return Number(value,); }
  if (targetType === "boolean") {
    if (value === "true" || value === "1") { return true; }
    if (value === "false" || value === "0") { return false; }
    return value;
  }
  return value;
}

function getTypeOfPath(object: Record<string, unknown>, configPath: string,): string {
  const parts = configPath.split(".",);
  let current: unknown = object;
  for (const part of parts) {
    if (typeof current !== "object" || current === null) { return "string"; }
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current;
}

function applyEnvironmentOverrides(config: Config, environmentMap: Record<string, string>,): Config {
  const result = structuredClone(config,) as unknown as Record<string, unknown>;
  for (const [environmentVariable, configPath,] of Object.entries(environmentMap,)) {
    const environmentValue = process.env[environmentVariable];
    if (environmentValue !== undefined) {
      const targetType = getTypeOfPath(config as unknown as Record<string, unknown>, configPath,);
      const coerced = coerceValue(environmentValue, targetType,);
      setByPath(result, configPath, coerced,);
    }
  }
  return result as unknown as Config;
}

/**
 * Detect if cwd is a git worktree and return the main repo root.
 *
 * In a worktree, `.git` is a file containing:
 *   gitdir: /path/to/main/.git/worktrees/<branch>
 *
 * Returns the main repo root (parent of `.git/`) or null if not in a worktree.
 */
function findMainRepoRoot(cwd: string,): string | null {
  const gitPath = path.join(cwd, ".git",);
  if (!existsSync(gitPath,)) { return null; }

  // .git is a directory → main repo, not a worktree
  try {
    if (statSync(gitPath,).isDirectory()) { return null; }
  } catch {
    return null;
  }

  // .git is a file — we're in a worktree
  const content = readFileSync(gitPath, "utf8",).trim();
  const match = /^gitdir:\s*(.+)$/.exec(content,);
  if (!match) { return null; }

  const gitdir = match[1]!;
  // gitdir points to <main>/.git/worktrees/<branch>
  // Walk up: worktrees → .git → main root
  const worktreesDir = path.dirname(gitdir,); // <main>/.git/worktrees
  const gitDir = path.dirname(worktreesDir,); // <main>/.git
  const mainRoot = path.dirname(gitDir,); // <main>

  // Verify .git is a directory there (actual main repo)
  const mainGitPath = path.join(mainRoot, ".git",);
  if (existsSync(mainGitPath,)) {
    try {
      if (statSync(mainGitPath,).isDirectory()) { return mainRoot; }
    } catch {
      // fall through
    }
  }
  return null;
}

function findConfigFile(cwd: string, fileNames: string[] = CONFIG_FILES,): { path: string; ext: string } | null {
  // Search project root, configs/ dir, and main repo root (for worktrees).
  const mainRoot = findMainRepoRoot(cwd,);
  const searchDirs = [cwd, path.join(cwd, "configs",),];
  if (mainRoot && mainRoot !== cwd) {
    searchDirs.push(mainRoot, path.join(mainRoot, "configs",),);
  }
  for (const dir of searchDirs) {
    for (const name of fileNames) {
      const fullPath = path.join(dir, name,);
      if (existsSync(fullPath,)) {
        return { path: fullPath, ext: name.split(".",).pop() as string, };
      }
    }
  }
  return null;
}

/** Return the first existing path among candidate dirs, or null. */
function firstExisting(candidates: string[],): string | null {
  for (const candidate of candidates) {
    if (existsSync(candidate,)) { return candidate; }
  }
  return null;
}

function parseFileContent(content: string, extension: string,): Record<string, unknown> {
  if (extension === "yaml" || extension === "yml") {
    return parseYaml(content,) as Record<string, unknown>;
  }
  if (extension === "toml") {
    return parseToml(content,);
  }
  throw new Error(`Unknown config file extension: .${extension}`,);
}

function validateConfig(config: Config,): void {
  ConfigSchema.validate(config,);
}

/** Create a default provider instance from LLM_PROVIDER_* env vars */
function applyProviderEnvVars(config: Config,): void {
  const baseUrl = process.env.LLM_PROVIDER_BASE_URL;
  if (!baseUrl) { return; }

  const provider: ProviderInstanceConfig = {
    name: process.env.LLM_PROVIDER_NAME ?? "default",
    label: process.env.LLM_PROVIDER_LABEL ?? "Default Provider",
    baseUrl,
    apiKey: process.env.LLM_PROVIDER_API_KEY,
    model: process.env.LLM_PROVIDER_MODEL ?? "default",
    timeout: Number.isNaN(Number(process.env.LLM_PROVIDER_TIMEOUT,),)
      ? 30_000
      : Number(process.env.LLM_PROVIDER_TIMEOUT,),
    retries: Number.isNaN(Number(process.env.LLM_PROVIDER_RETRIES,),)
      ? 3
      : Number(process.env.LLM_PROVIDER_RETRIES,),
    allowUserApiKey: process.env.LLM_PROVIDER_ALLOW_USER_KEY !== "false",
    models: {},
  };
  config.generation.providers.openaiCompatible.push(provider,);

  if (!config.generation.defaultProvider && process.env.LLM_DEFAULT_PROVIDER) {
    config.generation.defaultProvider = process.env.LLM_DEFAULT_PROVIDER;
  }
  if (!config.generation.defaultProvider) {
    config.generation.defaultProvider = provider.name;
  }
}

function loadConfig(cwd?: string,): Config {
  const directory = cwd ?? process.cwd();
  const mainRoot = findMainRepoRoot(directory,);
  let config: Config = structuredClone(new ConfigSchema().defaults,);

  // 1. Load config.default.* if present — team-shared defaults (committed to git)
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

  // 2. Load config.local.* if present — per-developer overrides (gitignored)
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

  // 3. Load env.yaml if present — overrides config file values
  //    Also check main repo root when running in a worktree.
  const envYamlCandidates = [path.join(directory, "env.yaml",), path.join(directory, "configs", "env.yaml",),];
  if (mainRoot && mainRoot !== directory) {
    envYamlCandidates.push(path.join(mainRoot, "env.yaml",), path.join(mainRoot, "configs", "env.yaml",),);
  }
  const envYamlPath = firstExisting(envYamlCandidates,);
  if (envYamlPath) {
    try {
      const content = readFileSync(envYamlPath, "utf8",);
      const parsed = parseFileContent(content, "yaml",);
      config = deepMerge(config as unknown as Record<string, unknown>, parsed,) as unknown as Config;
    } catch (error) {
      throw new Error(`Failed to parse env.yaml: ${(error as Error).message}`, {
        cause: error,
      },);
    }
  }

  // 4. Apply env var overrides — highest priority
  config = applyEnvironmentOverrides(config, ENV_MAP,);
  applyProviderEnvVars(config,);
  validateConfig(config,);
  return config;
}

export {
  applyProviderEnvVars,
  coerceValue,
  deepMerge,
  DEFAULT_CONFIG_FILES,
  ENV_MAP,
  loadConfig,
  LOCAL_CONFIG_FILES,
  setByPath,
  validateConfig,
};
