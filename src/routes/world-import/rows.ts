// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Row, } from "./types";

/**
 * @param value
 */
export function rowsOf(value: unknown,): Row[] {
  if (!Array.isArray(value,)) { return []; }
  const rows: Row[] = [];
  for (const v of value) {
    if (v && typeof v === "object") { rows.push(v as Row,); }
  }
  return rows;
}

/**
 * @param value
 */
export function rowOf(value: unknown,): Row | null {
  if (value && typeof value === "object") { return value as Row; }
  return null;
}

/**
 * @param row
 * @param key
 */
export function str(row: Row, key: string,): string | undefined {
  const v = row[key];
  return typeof v === "string" ? v : undefined;
}

/**
 * @param row
 * @param key
 */
export function strOrNull(row: Row, key: string,): string | null {
  const v = row[key];
  return typeof v === "string" || v === null ? v : null;
}

/**
 * @param row
 * @param key
 */
export function num(row: Row, key: string,): number | undefined {
  const v = row[key];
  return typeof v === "number" ? v : undefined;
}
