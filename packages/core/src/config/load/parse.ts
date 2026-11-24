// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/load/parse.ts — Config parsing & object helpers

/**
 * @param base
 * @param overrides
 * @returns T
 */
export function deepMerge<T extends object,>(base: T, overrides: Partial<T> | Record<string, unknown>,): T {
  const result = { ...base, };
  // Single documented boundary: generic T may be an interface without an
  // index signature, so writes go through one record view of the copy.
  const resultRecord = result as Record<string, unknown>;
  const overrideRecord = overrides as Record<string, unknown>;
  for (const key of Object.keys(overrideRecord,)) {
    const value = overrideRecord[key];
    if (value !== undefined) {
      const baseValue = (base as Record<string, unknown>)[key];
      const isObject = typeof value === "object" &&
        !Array.isArray(value,) &&
        typeof baseValue === "object" &&
        baseValue != null;

      resultRecord[key] = isObject
        ? deepMerge(baseValue as Record<string, unknown>, value as Record<string, unknown>,)
        : value;
    }
  }

  return result;
}

/**
 * @param object
 * @param path
 * @param value
 * @returns void
 */
export function setByPath(object: Record<string, unknown>, path: string, value: unknown,): void {
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

/**
 * Parse a numeric scalar, falling back on blank, non-finite or below-minimum
 * values. Keeps malformed env input from reaching numeric config fields.
 * @param value - raw env or config scalar
 * @param fallback - value used when the scalar is unusable
 * @param min - smallest accepted value (default: no lower bound)
 */
export function parseFiniteNumber(
  value: string,
  fallback: number,
  min = Number.NEGATIVE_INFINITY,
): number {
  if (value.trim() === "") { return fallback; }
  const parsed = Number(value,);
  return Number.isFinite(parsed,) && parsed >= min ? parsed : fallback;
}

/**
 * @param value
 * @param targetType
 * @returns void
 */
export function coerceValue(value: string, targetType: string,): unknown {
  if (targetType === "number") { return parseFiniteNumber(value, 0,); }
  if (targetType === "boolean") {
    if (value === "true" || value === "1") { return true; }
    if (value === "false" || value === "0") { return false; }
    return value;
  }

  return value;
}

/**
 * @param object
 * @param configPath
 * @returns void
 */
export function getTypeOfPath(object: Record<string, unknown>, configPath: string,): string {
  const parts = configPath.split(".",);
  let current: unknown = object;
  for (const part of parts) {
    if (typeof current !== "object" || current === null) { return "string"; }
    current = (current as Record<string, unknown>)[part];
  }

  return typeof current;
}

/**
 * @param content
 * @param extension
 * @throws {Error} If the file extension is unknown.
 * @returns {Record<string, unknown>}
 */
// TODO(env): bun-only — Bun.YAML/Bun.TOML are the config parser resolution point; add node parsers here when a node target lands.
export function parseFileContent(content: string, extension: string,): Record<string, unknown> {
  if (extension === "yaml" || extension === "yml") {
    return Bun.YAML.parse(content,) as Record<string, unknown>;
  }

  if (extension === "toml") {
    return Bun.TOML.parse(content,) as Record<string, unknown>;
  }

  throw new Error(`Unknown config file extension: .${extension}`,);
}

/**
 * Recursively strip empty-string and null leaf values so they revert to schema
 * defaults. This prevents user typos (e.g. `port: ""`) from overriding defaults.
 * Only affects scalar leaves; empty arrays/objects are preserved.
 * @param {Record<string, unknown>} obj
 * @returns {Record<string, unknown>}
 */
export function normalizeConfig(obj: Record<string, unknown>,): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value,] of Object.entries(obj,)) {
    if (value === null || value === "") { continue; }
    if (typeof value === "object" && !Array.isArray(value,)) {
      result[key] = normalizeConfig(value as Record<string, unknown>,);
    } else {
      result[key] = value;
    }
  }

  return result;
}
