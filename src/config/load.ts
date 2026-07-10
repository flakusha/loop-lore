// src/config/load.ts — Config file loader with env override

import { load as parseYaml } from "js-yaml";
import { parse as parseToml } from "smol-toml";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { Config, DEFAULTS } from "./schema";
import type { ProviderInstanceConfig } from "./schema";
import { ConfigSchema } from "./schema-class";

// Map flat env var names to dot-separated config paths
// Source of truth: ConfigSchema.envMap() — auto-generated from class hierarchy.
const ENV_MAP: Record<string, string> = ConfigSchema.envMap();

/** Env var check helper — detects when LLM_PROVIDER_* env vars are set */

// Config file candidates in priority order
const CONFIG_FILES = ["config.yaml", "config.yml", "config.toml"];

function deepMerge<T extends Record<string, unknown>>(base: T, overrides: Partial<T>): T {
  const result = { ...base };
  for (const key of Object.keys(overrides)) {
    const k = key as keyof T;
    const value = overrides[k];
    if (value !== undefined) {
      const baseValue = base[k];
      const isObject =
        typeof value === "object" &&
        !Array.isArray(value) &&
        typeof baseValue === "object" &&
        baseValue != null;
      result[k] = isObject
        ? (deepMerge(baseValue as Record<string, unknown>, value as Record<string, unknown>) as T[keyof T])
        : (value as T[keyof T]);
    }
  }
  return result;
}

function setByPath(object: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let current = object;
  for (let index = 0; index < parts.length - 1; index++) {
    const part = parts[index];
    if (!Object.hasOwn(current, part) || typeof current[part] !== "object") {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  current[parts.at(-1) as string] = value;
}

function coerceValue(value: string, targetType: string): unknown {
  if (targetType === "number") return Number(value);
  if (targetType === "boolean") {
    if (value === "true" || value === "1") return true;
    if (value === "false" || value === "0") return false;
    return value;
  }
  return value;
}

function getTypeOfPath(object: Record<string, unknown>, configPath: string): string {
  const parts = configPath.split(".");
  let current: unknown = object;
  for (const part of parts) {
    if (typeof current !== "object" || current === null) return "string";
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current;
}

function applyEnvironmentOverrides(config: Config, environmentMap: Record<string, string>): Config {
  const result = structuredClone(config) as unknown as Record<string, unknown>;
  for (const [environmentVariable, configPath] of Object.entries(environmentMap)) {
    const environmentValue = process.env[environmentVariable];
    if (environmentValue !== undefined) {
      const targetType = getTypeOfPath(config as unknown as Record<string, unknown>, configPath);
      const coerced = coerceValue(environmentValue, targetType);
      setByPath(result, configPath, coerced);
    }
  }
  return result as unknown as Config;
}

function findConfigFile(cwd: string): { path: string; ext: string } | null {
  // Search project root first, then a dedicated configs/ directory.
  const searchDirs = [cwd, path.join(cwd, "configs")];
  for (const dir of searchDirs) {
    for (const name of CONFIG_FILES) {
      const fullPath = path.join(dir, name);
      if (existsSync(fullPath)) {
        return { path: fullPath, ext: name.split(".").pop() as string };
      }
    }
  }
  return null;
}

/** Return the first existing path among candidate dirs, or null. */
function firstExisting(candidates: string[]): string | null {
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function parseFileContent(content: string, extension: string): Record<string, unknown> {
  if (extension === "yaml" || extension === "yml") {
    return parseYaml(content) as Record<string, unknown>;
  }
  if (extension === "toml") {
    return parseToml(content);
  }
  throw new Error(`Unknown config file extension: .${extension}`);
}

function validateConfig(config: Config): void {
  ConfigSchema.validate(config);
}

/** Create a default provider instance from LLM_PROVIDER_* env vars */
function applyProviderEnvVars(config: Config): void {
  const baseUrl = process.env.LLM_PROVIDER_BASE_URL;
  if (!baseUrl) return;

  const provider: ProviderInstanceConfig = {
    name: process.env.LLM_PROVIDER_NAME ?? "default",
    label: process.env.LLM_PROVIDER_LABEL ?? "Default Provider",
    baseUrl,
    apiKey: process.env.LLM_PROVIDER_API_KEY,
    model: process.env.LLM_PROVIDER_MODEL ?? "default",
    timeout: Number.isNaN(Number(process.env.LLM_PROVIDER_TIMEOUT))
      ? 30_000
      : Number(process.env.LLM_PROVIDER_TIMEOUT),
    retries: Number.isNaN(Number(process.env.LLM_PROVIDER_RETRIES))
      ? 3
      : Number(process.env.LLM_PROVIDER_RETRIES),
    allowUserApiKey: process.env.LLM_PROVIDER_ALLOW_USER_KEY !== "false",
    models: {},
  };
  config.generation.providers.openaiCompatible.push(provider);

  if (!config.generation.defaultProvider && process.env.LLM_DEFAULT_PROVIDER) {
    config.generation.defaultProvider = process.env.LLM_DEFAULT_PROVIDER;
  }
  if (!config.generation.defaultProvider) {
    config.generation.defaultProvider = provider.name;
  }
}

function loadConfig(cwd?: string): Config {
  const directory = cwd ?? process.cwd();
  let config: Config = structuredClone(DEFAULTS);

  // 1. Load config file (config.yaml / config.yml / config.toml) — lowest priority
  const found = findConfigFile(directory);
  if (found) {
    try {
      const content = readFileSync(found.path, "utf8");
      const parsed = parseFileContent(content, found.ext);
      config = deepMerge(config as unknown as Record<string, unknown>, parsed) as unknown as Config;
    } catch (error) {
      throw new Error(`Failed to parse config file ${found.path}: ${(error as Error).message}`, {
        cause: error,
      });
    }
  }

  // 2. Load env.yaml if present — overrides config file values
  const envYamlPath = firstExisting([
    path.join(directory, "env.yaml"),
    path.join(directory, "configs", "env.yaml"),
  ]);
  if (envYamlPath) {
    try {
      const content = readFileSync(envYamlPath, "utf8");
      const parsed = parseFileContent(content, "yaml");
      config = deepMerge(config as unknown as Record<string, unknown>, parsed) as unknown as Config;
    } catch (error) {
      throw new Error(`Failed to parse env.yaml: ${(error as Error).message}`, {
        cause: error,
      });
    }
  }

  // 3. Apply env var overrides — highest priority
  config = applyEnvironmentOverrides(config, ENV_MAP);
  applyProviderEnvVars(config);
  validateConfig(config);
  return config;
}

export { loadConfig, ENV_MAP, deepMerge, validateConfig, coerceValue, setByPath, applyProviderEnvVars };
