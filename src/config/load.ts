// src/config/load.ts — Config file loader with env override

import { load as parseYaml } from "js-yaml";
import { parse as parseToml } from "smol-toml";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { Config, DEFAULTS } from "./schema";

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
};

// Config file candidates in priority order
const CONFIG_FILES = ["config.yaml", "config.yml", "config.toml"];

function deepMerge<T extends Record<string, unknown>>(base: T, overrides: Partial<T>): T {
  const result = { ...base };
  for (const key of Object.keys(overrides)) {
    const k = key as keyof T;
    const val = overrides[k];
    if (val !== undefined) {
      const baseVal = base[k];
      const isObject =
        typeof val === "object" &&
        val != null &&
        !Array.isArray(val) &&
        typeof baseVal === "object" &&
        baseVal != null;
      result[k] = isObject
        ? (deepMerge(baseVal as Record<string, unknown>, val as Record<string, unknown>) as T[keyof T])
        : (val as T[keyof T]);
    }
  }
  return result;
}

function setByPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!current[part] || typeof current[part] !== "object") {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  current[parts.at(-1) as string] = value;
}

function coerceValue(value: string, targetType: string): unknown {
  if (targetType === "number") return Number.parseInt(value, 10);
  if (targetType === "boolean") {
    if (value === "true" || value === "1") return true;
    if (value === "false" || value === "0") return false;
    return value;
  }
  return value;
}

function getTypeOfPath(obj: Record<string, unknown>, configPath: string): string {
  const parts = configPath.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (typeof current !== "object" || current === null) return "string";
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current;
}

function applyEnvOverrides(config: Config, envMap: Record<string, string>): Config {
  const result = structuredClone(config) as unknown as Record<string, unknown>;
  for (const [envVar, configPath] of Object.entries(envMap)) {
    const envVal = process.env[envVar];
    if (envVal !== undefined) {
      const targetType = getTypeOfPath(config as unknown as Record<string, unknown>, configPath);
      const coerced = coerceValue(envVal, targetType);
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

function parseFileContent(content: string, ext: string): Record<string, unknown> {
  if (ext === "yaml" || ext === "yml") {
    return parseYaml(content) as Record<string, unknown>;
  }
  if (ext === "toml") {
    return parseToml(content);
  }
  throw new Error(`Unknown config file extension: .${ext}`);
}

function validateConfig(config: Config): void {
  const validDbTypes = ["sqlite", "postgres"];
  const validLogLevels = ["debug", "info", "warn", "error"];

  if (!validDbTypes.includes(config.db.type)) {
    throw new Error(`Invalid db.type: "${config.db.type}". Must be one of: ${validDbTypes.join(", ")}`);
  }
  if (config.db.type === "postgres" && !config.db.url) {
    throw new Error("db.url is required when db.type is 'postgres'");
  }
  if (config.server.port < 1 || config.server.port > 65_535) {
    throw new Error(`Invalid server.port: ${config.server.port}. Must be 1-65535`);
  }
  if (!validLogLevels.includes(config.logging.level)) {
    throw new Error(
      `Invalid logging.level: "${config.logging.level}". Must be one of: ${validLogLevels.join(", ")}`,
    );
  }
}

function loadConfig(cwd?: string): Config {
  const dir = cwd ?? process.cwd();
  let config: Config = structuredClone(DEFAULTS);

  const found = findConfigFile(dir);
  if (found) {
    try {
      const content = readFileSync(found.path, "utf8");
      const parsed = parseFileContent(content, found.ext);
      config = deepMerge(config as unknown as Record<string, unknown>, parsed) as unknown as Config;
    } catch (error) {
      throw new Error(`Failed to parse config file ${found.path}: ${(error as Error).message}`);
    }
  }

  config = applyEnvOverrides(config, ENV_MAP);
  validateConfig(config);
  return config;
}

export { loadConfig, ENV_MAP, deepMerge, validateConfig, coerceValue, setByPath };
