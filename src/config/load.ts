// src/config/load.ts — Config file loader with env override

import { load as parseYaml } from "js-yaml";
import { parse as parseToml } from "smol-toml";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { Config, DEFAULTS } from "./schema";
import type { ProviderInstanceConfig } from "./schema";

// Map flat env var names to dot-separated config paths
const ENV_MAP: Record<string, string> = {
  PORT: "server.port",
  HOST: "server.host",
  DB_TYPE: "db.type",
  SQLITE_FILENAME: "db.sqliteFilename",
  DATABASE_URL: "db.url",
  ENABLE_ASSETS: "assets.enabled",
  ASSETS_UPLOAD_DIR: "assets.uploadDir",
  ASSETS_MAX_FILE_SIZE: "assets.maxFileSize",
  ASSETS_COMPRESSION: "assets.compression",
  ENABLE_ASSISTANT: "assistant.enabled",
  LOG_LEVEL: "logging.level",
  ENABLE_TUI: "tui.enabled",
  ENABLE_DOCS: "docs.enabled",
  AGE_GATE_ENABLED: "ageGate.enabled",
  AGE_GATE_MINIMUM_AGE: "ageGate.minimumAge",
  AGE_GATE_MODE: "ageGate.mode",
  TLS_KEY: "server.tls.key",
  TLS_CERT: "server.tls.cert",
  AUTH_REQUIRED: "auth.required",
  AUTH_REGISTRATION_OPEN: "auth.registrationOpen",
  SESSION_TIMEOUT_HOURS: "auth.sessionTimeoutHours",
  SESSION_MAX_PER_USER: "auth.maxSessionsPerUser",
  DEMO_USERNAME: "auth.demoUsername",
  DEMO_AUTO_SETUP: "auth.demoAutoSetup",
  TRANSPORT_DEFAULT_PROTOCOL: "transport.defaultProtocol",
  TRANSPORT_ENABLE_WEBSOCKET: "transport.enableWebSocket",
  TRANSPORT_ENABLE_WEBTRANSPORT: "transport.enableWebTransport",
  TRANSPORT_ENABLE_H2: "transport.enableH2",
  TRANSPORT_ENABLE_H3: "transport.enableH3",
  TRANSPORT_COMPRESSION_ENABLED: "transport.compression.enabled",
  TRANSPORT_COMPRESSION_DEFAULT: "transport.compression.default",
  TRANSPORT_COMPRESSION_THRESHOLD: "transport.compression.threshold",
  TRANSPORT_MAX_FRAME_SIZE: "transport.limits.maxFrameSize",
  TRANSPORT_MAX_PAYLOAD: "transport.limits.maxPayload",
  TRANSPORT_MAX_CONCURRENT_STREAMS: "transport.limits.maxConcurrentStreams",
  MESSAGE_AUTO_HIDE_INVALID: "messages.autoHideInvalid",
  MESSAGE_HIDE_CONFIRMATION: "messages.hideConfirmation",
  MESSAGE_MAX_LENGTH: "messages.maxLength",
  MESSAGE_MAX_GENERATION_RETRIES: "messages.maxGenerationRetries",
  MESSAGE_GENERATION_TIMEOUT_MS: "messages.generationTimeoutMs",
  MESSAGE_IDEMPOTENCY_EXPIRY_HOURS: "messages.idempotencyExpiryHours",
  ALLOW_NSFW: "nsfw.allowNsfw",
  NSFW_MIN_AGE: "nsfw.nsfwMinAge",
  LLM_DEFAULT_PROVIDER: "generation.defaultProvider",
  BYO_KEY_ENABLED: "byoKey.enabled",
  BYO_KEY_ENCRYPTION_KEY: "byoKey.encryptionKey",
};

/** Env vars that auto-create a default OpenAI-compatible provider instance */
const _PROVIDER_ENV_VARS = ["LLM_PROVIDER_BASE_URL", "LLM_PROVIDER_API_KEY", "LLM_PROVIDER_MODEL"] as const;

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
        value != null &&
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
  for (const name of CONFIG_FILES) {
    const fullPath = path.join(cwd, name);
    if (existsSync(fullPath)) {
      return { path: fullPath, ext: name.split(".").pop() as string };
    }
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
  const validDatabaseTypes = ["sqlite", "postgres"];

  if (!validDatabaseTypes.includes(config.db.type)) {
    throw new Error(`Invalid db.type: "${config.db.type}". Must be one of: ${validDatabaseTypes.join(", ")}`);
  }
  if (config.db.type === "postgres" && !config.db.url) {
    throw new Error("db.url is required when db.type is 'postgres'");
  }
  if (config.server.port < 1 || config.server.port > 65_535) {
    throw new Error(`Invalid server.port: ${config.server.port}. Must be 1-65535`);
  }
  const validLogLevels = ["debug", "info", "warn", "error"];
  if (!validLogLevels.includes(config.logging.level)) {
    throw new Error(
      `Invalid logging.level: "${config.logging.level}". Must be one of: ${validLogLevels.join(", ")}`,
    );
  }
  if (config.generation.defaultProvider && config.generation.providers.openaiCompatible.length === 0) {
    // Warning only — provider may come from env vars post-merge
  }
  for (const provider of config.generation.providers.openaiCompatible) {
    if (!provider.baseUrl) {
      throw new Error(`generation.providers.openaiCompatible entry "${provider.name}" missing baseUrl`);
    }
    if (!provider.model) {
      throw new Error(`generation.providers.openaiCompatible entry "${provider.name}" missing model`);
    }
  }
  if (config.generation.providers.anthropic && !config.generation.providers.anthropic.apiKey) {
    throw new Error("generation.providers.anthropic requires apiKey");
  }
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
    timeout: Number(process.env.LLM_PROVIDER_TIMEOUT) || 30_000,
    retries: Number(process.env.LLM_PROVIDER_RETRIES) || 3,
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
  const envYamlPath = path.join(directory, "env.yaml");
  if (existsSync(envYamlPath)) {
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
