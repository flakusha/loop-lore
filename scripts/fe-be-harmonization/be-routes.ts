// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Backend route collection: literal Elysia registrations plus the two known
 * dynamic producers (createEntityRoutes factory, memory-carry plugin).
 */

import { readFileSync, } from "node:fs";
import path from "node:path";
import { type BeRoute, callExtent, lineOf, norm, ROOT, walk, } from "./shared";

const BE_SCAN_DIRS = ["src/routes", "src",];
const BE_EXTRA_FILES = ["src/elysia-app.ts",];
const BE_FILE_RE = /(route|controller)\.ts$/i;
function isBeFile(p: string,): boolean {
  if (p.includes("/routes/",)) { return true; }
  const rel = path.relative(ROOT, p,);
  if (BE_EXTRA_FILES.includes(rel,)) { return true; }
  return BE_FILE_RE.test(path.basename(p,),);
}

/** String constants usable inside route templates (prefix, R from sibling schemas). */
function routeConsts(src: string, dir: string, prefix: string,): Map<string, string> {
  const consts = new Map<string, string>();
  for (const cm of src.matchAll(/const (\w+) =\s*"([^"]+)"/g,)) {
    consts.set(cm[1] ?? "", cm[2] ?? "",);
  }
  // Template-literal RHS: `const R = \`\${prefix}/rpg\``. resolveRouteConsts
  // (3-pass) substitutes ${...} refs against the const map; capture raw here.
  for (const cm of src.matchAll(/const (\w+) =\s*`([^`]*)`/g,)) {
    const name = cm[1] ?? "";
    if (consts.has(name,)) { continue; }
    consts.set(name, cm[2] ?? "",);
  }
  try {
    const sib = readFileSync(path.join(dir, "schemas.ts",), "utf8",);
    for (const cm of sib.matchAll(/export const (\w+) =\s*"([^"]+)"/g,)) {
      if (!consts.has(cm[1] ?? "",)) { consts.set(cm[1] ?? "", cm[2] ?? "",); }
    }
  } catch { /* no sibling schemas */ }
  // Function-parameter default: `(opts: X, prefix = "/api")` — the dominant pattern
  // across ~50 route files. Without this, ${prefix}/foo templates norm to
  // "/:param/foo" and every such route is misreported as BE-no-FE.
  for (const pm of src.matchAll(/\bprefix\s*=\s*["'](\/[^"']*)["']/g,)) {
    if (!consts.has("prefix",)) { consts.set("prefix", pm[1] ?? prefix,); }
  }
  // ponytail: file-scoped heuristic; per-call param shadowing not modeled.
  consts.set("prefix", consts.get("prefix",) ?? prefix,);
  return consts;
}

/** Expand `${name}` template refs with the route const map (3 passes max). */
function resolveRouteConsts(s: string, consts: Map<string, string>,): string {
  let out = s;
  for (let k = 0; k < 3; k++) {
    const n = out.replace(/\$\{(\w+)\}/g, (mm, name,) => consts.get(name as string,) ?? mm,);
    if (n === out) { break; }
    out = n;
  }
  return out;
}

/** Literal route registrations in one file (skips .all catch-alls). */
function literalBeRoutes(src: string, rel: string, resolve: (s: string,) => string, out: BeRoute[],): void {
  const re = /\.(get|post|put|patch|delete|all)\s*\(\s*(`(?:[^`\\]|\\.)*`|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src,)) !== null) {
    const verb = ((m[1] ?? "get") as string).toUpperCase();
    if (verb === "ALL") { continue; }
    const raw = resolve((m[2] ?? "").slice(1, -1,),);
    if (!raw.startsWith("/",) && !raw.includes("${",)) { continue; }
    const win = callExtent(src, m.index,);
    out.push({
      method: verb,
      path: norm(raw,),
      raw: raw.slice(0, 90,),
      file: rel,
      line: lineOf(src, m.index,),
      bodySchema: /body\s*:\s*(\w+)/.exec(win,)?.[1] ?? null,
      querySchema: /query\s*:\s*(\w+)/.exec(win,)?.[1] ?? null,
    },);
  }
}

/** Collect Elysia route registrations across the scan dirs. */
export function scanBe(): BeRoute[] {
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
      const prefix = /prefix\s*=\s*"([^"]+)"/.exec(src,)?.[1] ?? "/api";
      const consts = routeConsts(src, path.dirname(f,), prefix,);
      // Entity-factory files destructure `const { withIdPath, basePath } = entityPaths(...)`.
      // Resolve those names so ${withIdPath}/carry etc. route templates expand correctly.
      const ecfg =
        /parentPrefix:\s*"([^"]+)"[\s\S]{0,200}?parentParam:\s*"([^"]+)"[\s\S]{0,200}?entityPath:\s*"([^"]+)"/
          .exec(src,);
      if (ecfg) {
        const basePath = `${prefix}/${ecfg[1]}/:${ecfg[2]}/${ecfg[3]}`;
        const withIdPath = `${basePath}/:entityId`;
        consts.set("basePath", basePath,);
        consts.set("withIdPath", withIdPath,);
      }
      literalBeRoutes(src, rel, (s,) => resolveRouteConsts(s, consts,), out,);
      expandEntityFactories(src, rel, out,);
      expandMemoryCarryPlugin(src, rel, consts, out,);
    }
  }
  return out;
}

/** Expand createEntityRoutes({parentPrefix, parentParam, entityPath}) into CRUD. */
function expandEntityFactories(src: string, rel: string, out: BeRoute[],): void {
  const cfg = /parentPrefix:\s*"([^"]+)"[\s\S]{0,200}?parentParam:\s*"([^"]+)"[\s\S]{0,200}?entityPath:\s*"([^"]+)"/
    .exec(src,);
  if (!cfg) { return; }
  const base = `/api/${cfg[1]}/:${cfg[2]}/${cfg[3]}`;
  const line = lineOf(src, cfg.index,);
  const crud: Array<[string, string,]> = [
    ["GET", base,],
    ["POST", base,],
    ["GET", `${base}/:entityId`,],
    ["PUT", `${base}/:entityId`,],
    ["DELETE", `${base}/:entityId`,],
  ];
  for (const [method, p,] of crud) {
    out.push({ method, path: norm(p,), raw: p, file: rel, line, bodySchema: null, querySchema: null, },);
  }
}

/** Expand the memory-carry plugin's two dynamic paths. */
function expandMemoryCarryPlugin(
  src: string,
  rel: string,
  consts: Map<string, string>,
  out: BeRoute[],
): void {
  if (!src.includes("memoryCarryPlugin",)) { return; }
  const withIdPath = consts.get("withIdPath",);
  const basePath = consts.get("basePath",);
  if (!withIdPath || !basePath) { return; }
  for (const p of [`${withIdPath}/carry`, `${basePath}/carry-except`,]) {
    out.push({ method: "POST", path: norm(p,), raw: p, file: rel, line: 0, bodySchema: null, querySchema: null, },);
  }
}
