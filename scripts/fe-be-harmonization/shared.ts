// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shared constants, types, and path helpers for the FE-BE harmonization check.
 */

import { readdirSync, statSync, } from "node:fs";
import path from "node:path";

export const ROOT = path.resolve(import.meta.dir, "..", "..",);
export const REPORT = path.join(ROOT, ".tmp", "fe-be-harmony.json",);

export interface FeCall {
  method: string;
  path: string;
  raw: string;
  file: string;
  line: number;
  bodyKeys: string[];
  queryKeys: string[];
}
export interface BeRoute {
  method: string;
  path: string;
  raw: string;
  file: string;
  line: number;
  bodySchema: string | null;
  querySchema: string | null;
}

export function walk(dir: string, exts: string[],): string[] {
  const out: string[] = [];
  let s;
  try {
    s = statSync(dir,);
  } catch {
    return out;
  }
  if (!s.isDirectory()) { return out; }
  for (const e of readdirSync(dir,)) {
    const p = path.join(dir, e,);
    const st = statSync(p,);
    if (st.isDirectory()) { out.push(...walk(p, exts,),); }
    else if (exts.some((x,) => e.endsWith(x,)) && !e.endsWith(".test.ts",)) { out.push(p,); }
  }
  return out;
}

export function lineOf(src: string, idx: number,): number {
  return src.slice(0, idx,).split("\n",).length;
}

/** Slice of the call expression starting at `from` (matches parens, strings, templates). */
function skipInterpolation(src: string, i: number,): number {
  let b = 1;
  let j = i + 2;
  while (j < src.length && b > 0) {
    if (src[j] === "{") { b++; }
    if (src[j] === "}") { b--; }
    j++;
  }
  return j;
}

/** Consume one quoted char inside a string; reports new index + quote state. */
function stepInString(
  src: string,
  i: number,
  q: string,
  esc: boolean,
): { next: number; quote: string; escaped: boolean } {
  const ch = src[i] ?? "";
  if (esc) { return { next: i + 1, quote: q, escaped: false, }; }
  if (ch === "\\") { return { next: i + 1, quote: q, escaped: true, }; }
  if (ch === q) { return { next: i + 1, quote: "", escaped: false, }; }
  if (q === "`" && ch === "$" && src[i + 1] === "{") {
    return { next: skipInterpolation(src, i,), quote: q, escaped: false, };
  }
  return { next: i + 1, quote: q, escaped: false, };
}

/** Full call-expression slice from `from` to the matching close-paren (bounded). */
export function callExtent(src: string, from: number,): string {
  const open = src.indexOf("(", from,);
  if (open < 0) { return ""; }
  let i = open;
  let depth = 0;
  let q = "";
  let esc = false;
  while (i < src.length) {
    if (q) {
      const st = stepInString(src, i, q, esc,);
      i = st.next;
      q = st.quote;
      esc = st.escaped;
      continue;
    }
    const ch = src[i] ?? "";
    if (ch === '"' || ch === "'" || ch === "`") { q = ch; }
    else if (ch === "(") { depth++; }
    else if (ch === ")") {
      depth--;
      if (depth === 0) { return src.slice(from, i + 1,); }
    }
    i++;
  }
  return src.slice(from, Math.min(from + 500, src.length,),);
}

/** Normalize: cut to /api, strip version (/v1), interpolations → :param. */
export function norm(raw: string,): string {
  let p = raw.split("?",)[0] ?? "";
  const api = p.indexOf("/api",);
  if (api > 0) { p = p.slice(api,); }
  p = p.replace(/\$\{[^}]*\}/g, "/:param",);
  p = p.replace(/encodeURIComponent\([^)]*\)/g, ":param",);
  p = p.replace(/\/\/+/g, "/",);
  if (p.startsWith("/api",)) { p = p.slice(4,) || "/"; }
  p = p.replace(/^\/v\d+(?=\/|$)/, "",) || "/";
  if (!p.startsWith("/",)) { p = `/${p}`; }
  return p.replace(/\/$/, "",) || "/";
}

export function samePath(a: string, b: string,): boolean {
  const sa = a.split("/",);
  const sb = b.split("/",);
  if (sa.length !== sb.length) { return false; }
  return sa.every((x, i,) => x === sb[i] || x.startsWith(":",) || (sb[i] ?? "").startsWith(":",));
}
