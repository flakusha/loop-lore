#!/usr/bin/env bun
// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * FE-BE harmonization check.
 *
 * Joins frontend API calls against Elysia routes + TypeBox schemas.
 * Blocking: FE call with no BE route, method mismatch, unknown body/query
 * key, missing required body key (when the FE body literal is visible).
 * Advisory while triage is open: factory-built routes (createEntityRoutes
 * parentPrefix/entityPath) and guarded/group-mounted paths are invisible to
 * the literal scan and surface as FE-no-BE until taught. Promote to blocking
 * once triage clears or allowlists the classes below.
 *
 * Run: `bun run scripts/check-fe-be-harmonization.ts`
 */

import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dir, "..",);
const FE_DIRS = ["src/frontend", "src/components", "src/views", "src/partials",];
const BE_SCAN_DIRS = ["src/routes", "src",];
const BE_FILE_RE = /(route|controller)\.ts$/i;
function isBeFile(p: string,): boolean {
  if (p.includes("/routes/",)) { return true; }
  return BE_FILE_RE.test(path.basename(p,),);
}
const SCHEMA_DIR = path.join(ROOT, "src", "validation", "schemas",);
const REPORT = path.join(ROOT, ".tmp", "fe-be-harmony.json",);

interface FeCall {
  method: string;
  path: string;
  raw: string;
  file: string;
  line: number;
  bodyKeys: string[];
  queryKeys: string[];
}
interface BeRoute {
  method: string;
  path: string;
  raw: string;
  file: string;
  line: number;
  bodySchema: string | null;
  querySchema: string | null;
}

function walk(dir: string, exts: string[],): string[] {
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

function lineOf(src: string, idx: number,): number {
  return src.slice(0, idx,).split("\n",).length;
}

/** Normalize: cut to /api, strip version (/v1), interpolations → :param. */
function norm(raw: string,): string {
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

function samePath(a: string, b: string,): boolean {
  const sa = a.split("/",);
  const sb = b.split("/",);
  if (sa.length !== sb.length) { return false; }
  return sa.every((x, i,) => x === sb[i] || x.startsWith(":",) || (sb[i] ?? "").startsWith(":",));
}

function scanFe(): FeCall[] {
  const out: FeCall[] = [];
  for (const d of FE_DIRS) {
    for (const f of walk(path.join(ROOT, d,), [".ts", ".html",],)) {
      const src = readFileSync(f, "utf8",);
      const rel = path.relative(ROOT, f,);
      if (f.endsWith(".html",)) {
        const re = /hx-(get|post|put|patch|delete)\s*=\s*"([^"]+)"/gi;
        let m: RegExpExecArray | null;
        while ((m = re.exec(src,)) !== null) {
          const raw = m[2] ?? "";
          if (!raw.startsWith("/",)) { continue; }
          out.push({
            method: (m[1] ?? "get").toUpperCase(),
            path: norm(raw,),
            raw,
            file: rel,
            line: lineOf(src, m.index,),
            bodyKeys: [],
            queryKeys: qsKeys(raw,),
          },);
        }
        continue;
      }
      const re =
        /\b(?:feFetch|apiFetch|safeFetch|fetch)\s*\(\s*(`(?:[^`\\]|\\.)*`|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src,)) !== null) {
        const lit = m[1] ?? "";
        const raw = lit.slice(1, -1,);
        if (!raw.includes("/api",)) { continue; }
        if (/^https?:/.test(raw,)) { continue; }
        const win = callExtent(src, m.index,);
        const mm = /method\s*:\s*["'](GET|POST|PUT|PATCH|DELETE)["']/i.exec(win,);
        const bm = /JSON\.stringify\(\{([^}]*)\}/.exec(win,);
        const bodyKeys = bm ? [...bm[1].matchAll(/(\w+)\s*:/g,),].map((k,) => k[1] ?? "").filter(Boolean,) : [];
        out.push({
          method: (mm?.[1] ?? "GET").toUpperCase(),
          path: norm(raw,),
          raw: raw.slice(0, 90,),
          file: rel,
          line: lineOf(src, m.index,),
          bodyKeys,
          queryKeys: qsKeys(raw,),
        },);
      }
    }
  }
  return out;
}

/** Slice of the call expression starting at `from` (matches parens, strings, templates). */
function callExtent(src: string, from: number,): string {
  const open = src.indexOf("(", from,);
  if (open < 0) { return ""; }
  let i = open;
  let depth = 0;
  let q = "";
  let esc = false;
  while (i < src.length) {
    const ch = src[i] ?? "";
    if (q) {
      if (esc) { esc = false; }
      else if (ch === "\\") { esc = true; }
      else if (ch === q) { q = ""; }
      else if (q === "`" && ch === "$" && src[i + 1] === "{") {
        let b = 1;
        i += 2;
        while (i < src.length && b > 0) {
          if (src[i] === "{") { b++; }
          if (src[i] === "}") { b--; }
          i++;
        }
        continue;
      }
      i++;
      continue;
    }
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

function qsKeys(raw: string,): string[] {
  const q = raw.split("?",)[1];
  if (!q) { return []; }
  return q.split("&",).map((p,) => p.split("=",)[0]?.trim() ?? "").filter((k,) => k && !k.includes("${",));
}

function scanBe(): BeRoute[] {
  const out: BeRoute[] = [];
  const seen = new Set<string>();
  for (const d of BE_SCAN_DIRS) {
    const all = walk(path.join(ROOT, d,), [".ts",],);
    const files = d === "src" ? all.filter(isBeFile,) : all;
    for (const f of files) {
      if (seen.has(f,)) { continue; }
      seen.add(f,);
      const src = readFileSync(f, "utf8",);
      const rel = path.relative(ROOT, f,);
      const pm = /prefix\s*=\s*"([^"]+)"/.exec(src,);
      const prefix = pm?.[1] ?? "/api";
      const consts = new Map<string, string>();
      for (const cm of src.matchAll(/const (\w+) =\s*"([^"]+)"/g,)) {
        consts.set(cm[1] ?? "", cm[2] ?? "",);
      }
      try {
        const sib = readFileSync(path.join(path.dirname(f,), "schemas.ts",), "utf8",);
        for (const cm of sib.matchAll(/export const (\w+) =\s*"([^"]+)"/g,)) {
          if (!consts.has(cm[1] ?? "",)) { consts.set(cm[1] ?? "", cm[2] ?? "",); }
        }
      } catch { /* no sibling schemas */ }
      const resolveConsts = (s: string,): string => {
        let out = s;
        for (let k = 0; k < 3; k++) {
          const n = out.replace(
            /\$\{(\w+)\}/g,
            (mm, name,) => name === "prefix" ? prefix : (consts.get(name as string,) ?? mm),
          );
          if (n === out) { break; }
          out = n;
        }
        return out;
      };
      const re = /\.(get|post|put|patch|delete)\s*\(\s*(`(?:[^`\\]|\\.)*`|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(src,)) !== null) {
        const method = ((m[1] ?? "get") as string).toUpperCase();
        const lit = (m[2] ?? "") as string;
        const raw = resolveConsts(lit.slice(1, -1,),);
        if (!raw.startsWith("/",) && !raw.includes("${",)) { continue; }
        const win = callExtent(src, m.index,);
        const body = /body\s*:\s*(\w+)/.exec(win,)?.[1] ?? null;
        const query = /query\s*:\s*(\w+)/.exec(win,)?.[1] ?? null;
        out.push({
          method,
          path: norm(raw,),
          raw: raw.slice(0, 90,),
          file: rel,
          line: lineOf(src, m.index,),
          bodySchema: body,
          querySchema: query,
        },);
      }
    }
  }
  return out;
}

function scanSchemas(): Map<string, { required: string[]; optional: string[] }> {
  const map = new Map<string, { required: string[]; optional: string[] }>();
  for (const f of walk(SCHEMA_DIR, [".ts",],)) {
    const src = readFileSync(f, "utf8",);
    const re = /export const (\w+)\s*=\s*t\.Object\(\{/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(src,)) !== null) {
      const name = m[1] ?? "";
      let i = m.index + m[0].length - 1;
      let depth = 0;
      let end = src.length;
      for (let j = i; j < src.length; j++) {
        if (src[j] === "{") { depth++; }
        if (src[j] === "}") {
          depth--;
          if (depth === 0) {
            end = j;
            break;
          }
        }
      }
      const body = src.slice(i, end,);
      const required: string[] = [];
      const optional: string[] = [];
      for (const lm of body.matchAll(/^\s*(\w+)\s*:/gm,)) {
        const key = lm[1] ?? "";
        if (!key || map.has(`${name}.${key}`,)) { continue; }
        const line = body.slice(0, lm.index ?? 0,).split("\n",).pop() ?? "";
        const full = `${line} ${body.slice(lm.index ?? 0, (lm.index ?? 0) + 80,)}`;
        if (full.includes("t.Optional",)) { optional.push(key,); }
        else { required.push(key,); }
      }
      map.set(name, { required, optional, },);
    }
  }
  return map;
}

const fe = scanFe();
const be = scanBe();
const schemas = scanSchemas();
const blocking: string[] = [];
const advisory: string[] = [];

for (const c of fe) {
  const same = be.filter((r,) => samePath(r.path, c.path,));
  if (same.length === 0) {
    blocking.push(
      `${c.file}:${c.line} [blocking] FE-no-BE: ${c.method} ${c.raw} — no backend route; add route or fix URL.`,
    );
    continue;
  }
  if (!same.some((r,) => r.method === c.method)) {
    blocking.push(
      `${c.file}:${c.line} [blocking] method mismatch: FE ${c.method} ${c.raw} vs BE ${
        same.map((r,) => r.method).join("/",)
      }; align method.`,
    );
  }
  const route = same.find((r,) => r.method === c.method) ?? same[0]!;
  const checkKeys = (keys: string[], schemaName: string | null, kind: string,): void => {
    if (!schemaName || keys.length === 0) { return; }
    const s = schemas.get(schemaName,);
    if (!s) { return; }
    for (const key of keys) {
      if (!s.required.includes(key,) && !s.optional.includes(key,)) {
        blocking.push(
          `${c.file}:${c.line} [blocking] unknown ${kind} key "${key}" for ${c.method} ${c.raw} (schema ${schemaName}); remove flag or extend schema.`,
        );
      }
    }
  };
  checkKeys(c.bodyKeys, route.bodySchema, "body",);
  checkKeys(c.queryKeys, route.querySchema, "query",);
  if (c.bodyKeys.length > 0 && route.bodySchema) {
    const s = schemas.get(route.bodySchema,);
    if (s) {
      for (const req of s.required) {
        if (!c.bodyKeys.includes(req,)) {
          blocking.push(
            `${c.file}:${c.line} [blocking] missing required "${req}" for ${c.method} ${c.raw} (schema ${route.bodySchema}); add field.`,
          );
        }
      }
    }
  }
}

for (const r of be) {
  if (!fe.some((c,) => samePath(c.path, r.path,))) {
    advisory.push(
      `${r.file}:${r.line} [advisory] BE-no-FE: ${r.method} ${r.raw} — no frontend caller (may serve TUI/curl/partner).`,
    );
  }
}

mkdirSync(path.dirname(REPORT,), { recursive: true, },);
writeFileSync(REPORT, JSON.stringify({ blocking, advisory, counts: { fe: fe.length, be: be.length, }, }, null, 2,),);
console.log("=== FE-BE harmonization ===",);
console.log(`FE calls: ${fe.length}, BE routes: ${be.length}, schemas: ${schemas.size}`,);
for (const b of blocking) { console.log(`  ${b}`,); }
for (const a of advisory.slice(0, 20,)) { console.log(`  ${a}`,); }
if (advisory.length > 20) {
  console.log(
    `  ... +${advisory.length - 20} more advisory (see .tmp/fe-be-harmony.json)`,
  );
}
if (blocking.length > 0) {
  console.log(`\nfail: ${blocking.length} blocking drift finding(s).`,);
  process.exit(1,);
}
console.log("OK: no blocking drift.",);
