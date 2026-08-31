// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/config/load/parse.ts — Config parsing & object helpers

/**
 * @param base
 * @param overrides
 */
export function deepMerge<T extends Record<string, unknown>,>(base: T, overrides: Partial<T>,): T {
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

/**
 * @param object
 * @param path
 * @param value
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
 * @param value
 * @param targetType
 */
export function coerceValue(value: string, targetType: string,): unknown {
  if (targetType === "number") { return Number(value,); }
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
 */
export function parseFileContent(content: string, extension: string,): Record<string, unknown> {
  if (extension === "yaml" || extension === "yml") {
    return Bun.YAML.parse(content,) as Record<string, unknown>;
  }
  if (extension === "toml") {
    return Bun.TOML.parse(content,) as Record<string, unknown>;
  }
  throw new Error(`Unknown config file extension: .${extension}`,);
}
