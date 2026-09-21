// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/load/env.ts — Environment variable application

import type { Config, ProviderInstanceConfig, } from "../schema";
import { coerceValue, getTypeOfPath, setByPath, } from "./parse";

/**
 * @param config
 * @param environmentMap
 * @returns Config
 */
export function applyEnvironmentOverrides(config: Config, environmentMap: Record<string, string>,): Config {
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

/** True when `path` resolves to a defined value (e.g. an explicit nested key in the same file). */
function hasPath(obj: Record<string, unknown>, path: string,): boolean {
  let current: unknown = obj;
  for (const part of path.split(".",)) {
    if (typeof current !== "object" || current === null) { return false; }
    current = (current as Record<string, unknown>)[part];
  }
  return current !== undefined;
}

/**
 * Lift flat ENV_MAP-style keys (e.g. `TELEMETRY_PII_SECRET`) from a parsed
 * env-file object to their nested config paths (e.g.
 * `observability.telemetry.piiSecret`). An explicit nested key in the same
 * file wins; the flat key is removed either way. Raw process.env still wins
 * over everything via applyEnvironmentOverrides.
 * @param parsed Parsed env-file content (mutated in place). May be null.
 * @param environmentMap ENV_VAR -> dot.path mapping.
 * @returns Record
 */
export function liftFlatEnvKeys(
  parsed: Record<string, unknown> | null,
  environmentMap: Record<string, string>,
): Record<string, unknown> {
  if (parsed === null || typeof parsed !== "object") { return parsed ?? {}; }
  for (const [environmentVariable, configPath,] of Object.entries(environmentMap,)) {
    const flatValue = parsed[environmentVariable];
    if (flatValue === undefined || typeof flatValue === "object") { continue; }
    if (hasPath(parsed, configPath,)) {
      delete parsed[environmentVariable];
      continue;
    }
    setByPath(parsed, configPath, flatValue,);
    delete parsed[environmentVariable];
  }
  return parsed;
}

/**
 * Create a default provider instance from LLM_PROVIDER_* env vars
 * @param config
 * @returns void
 */
export function applyProviderEnvVars(config: Config,): void {
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
