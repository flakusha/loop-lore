import type { Row, } from "./types";

export function rowsOf(value: unknown,): Row[] {
  if (!Array.isArray(value,)) { return []; }
  const rows: Row[] = [];
  for (const v of value) {
    if (v && typeof v === "object") { rows.push(v as Row,); }
  }
  return rows;
}

export function rowOf(value: unknown,): Row | null {
  if (value && typeof value === "object") { return value as Row; }
  return null;
}

export function str(row: Row, key: string,): string | undefined {
  const v = row[key];
  return typeof v === "string" ? v : undefined;
}

export function strOrNull(row: Row, key: string,): string | null {
  const v = row[key];
  return typeof v === "string" || v === null ? v : null;
}

export function num(row: Row, key: string,): number | undefined {
  const v = row[key];
  return typeof v === "number" ? v : undefined;
}
