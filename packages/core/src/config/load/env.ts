// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/load/env.ts — Environment variable application

import { isWellFormedBcp47, } from "@/i18n/bcp47";
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

/**
 * True when `path` resolves to a defined value (e.g. an explicit nested key in the same file).
 * @param obj
 * @param path
 */
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
 * Spellings that turn a boolean env var on. Mirrors the disabled-value set
 * used for system_config flags (`"false"|"0"|"off"|"no"`).
 */
const ENABLED_VALUES = new Set(["true", "1", "on", "yes",],);

/**
 * Create a default provider instance from LLM_PROVIDER_* env vars
 * @param config
 * @throws {Error} when LLM_PROVIDER_LOCALE is not a well-formed BCP-47 tag
 * @returns void
 */
export function applyProviderEnvVars(config: Config,): void {
  const baseUrl = process.env.LLM_PROVIDER_BASE_URL;
  if (!baseUrl) { return; }

  // Unset keeps the permissive default; a present-but-unrecognised value
  // denies, so a typo fails closed rather than silently admitting a user's
  // credential to the provider.
  const allowUserKey = process.env.LLM_PROVIDER_ALLOW_USER_KEY?.trim().toLowerCase();

  // FEAT-model-native-locale-config: an operator-declared native locale must
  // be a well-formed BCP-47 tag (free-form — models speak more than the 10
  // UI-registry languages); a malformed value fails config load (loader
  // throw convention) instead of silently degrading translation targets.
  const locale = process.env.LLM_PROVIDER_LOCALE;
  if (locale !== undefined && !isWellFormedBcp47(locale,)) {
    throw new Error(
      `LLM_PROVIDER_LOCALE: malformed locale "${locale}". Expected a BCP-47 tag like "en" or "en-US"`,
    );
  }

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
    allowUserApiKey: allowUserKey === undefined ? true : ENABLED_VALUES.has(allowUserKey,),
    locale,
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
