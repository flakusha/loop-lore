#!/usr/bin/env bun
// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
/**
 * plan-code-map — reverse index from `src/…` paths to the plans that own them.
 *
 * Scans plan + spec markdown (`.plan/tickets/`, `.plan/epics/`, `docs/spec/`,
 * `docs/frontend/`) for `src/…` prose references and emits
 * `.plan/code-map.json`:  src path → [{ kind, source }].
 *
 * Modes:
 *   bun run scripts/plan-code-map.ts                # build/refresh the index
 *   bun run scripts/plan-code-map.ts --find <path>  # query owners of a path
 *   bun run scripts/plan-code-map.ts --check        # report stale src refs
 *
 * The reverse index answers: "which ticket/epic/spec mentions src/foo/bar.ts?"
 */
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync, } from "node:fs";
import { join, resolve, } from "node:path";
import { extractSrcRefs, } from "./lib/src-refs";

const PROJECT_ROOT = resolve(import.meta.dir, "..",);
const MAP_PATH = join(PROJECT_ROOT, ".plan", "code-map.json",);

// Sources scanned for src/ references, with a kind label for the map.
const SOURCES: Array<{ dir: string; kind: string }> = [
  { dir: ".plan/tickets", kind: "ticket", },
  { dir: ".plan/epics", kind: "epic", },
  { dir: "docs/spec", kind: "spec", },
  { dir: "docs/frontend", kind: "frontend", },
];

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", ".venv", "coverage", ".vitepress",],);

interface RefEntry {
  kind: string;
  source: string;
}

type CodeMap = Record<string, RefEntry[]>;

function collectMdFiles(dir: string,): string[] {
  const root = join(PROJECT_ROOT, dir,);
  const out: string[] = [];
  if (!existsSync(root,)) { return out; }
  const walk = (d: string,): void => {
    for (const entry of readdirSync(d,)) {
      if (SKIP_DIRS.has(entry,)) { continue; }
      const p = join(d, entry,);
      if (statSync(p,).isDirectory()) { walk(p,); }
      else if (p.endsWith(".md",)) { out.push(p,); }
    }
  };
  walk(root,);
  return out;
}

function buildMap(): CodeMap {
  const map: CodeMap = {};
  for (const { dir, kind, } of SOURCES) {
    for (const file of collectMdFiles(dir,)) {
      const raw = readFileSync(file, "utf8",);
      const rel = file.slice(PROJECT_ROOT.length + 1,);
      for (const { path, } of extractSrcRefs(raw,)) {
        (map[path] ??= []).push({ kind, source: rel, },);
      }
    }
  }
  // Sort entries deterministically (by source) for stable diffs.
  for (const path of Object.keys(map,)) {
    map[path]!.sort((a, b,) => a.source.localeCompare(b.source,));
  }
  // Sort keys for stable output.
  const sorted: CodeMap = {};
  for (const key of Object.keys(map,).sort()) { sorted[key] = map[key]!; }
  return sorted;
}

function readMap(): CodeMap {
  if (!existsSync(MAP_PATH,)) { return {}; }
  try {
    return JSON.parse(readFileSync(MAP_PATH, "utf8",),) as CodeMap;
  } catch {
    return {};
  }
}

function findOwners(path: string,): void {
  const map = readMap();
  const norm = path.replace(/^\.\//, "",).replace(/^\//, "",);
  const exact = map[norm];
  if (exact && exact.length > 0) {
    console.log(`${norm}`,);
    for (const e of exact) {
      console.log(`  [${e.kind}] ${e.source}`,);
    }
    return;
  }
  // Prefix match (directory-level refs, e.g. `src/rpg/`).
  const prefixHits = Object.entries(map,).filter(([k,],) => k.startsWith(norm + "/",) && k !== norm);
  if (prefixHits.length > 0) {
    console.log(`${norm} (directory — ${prefixHits.length} nested path(s) referenced)`,);
    for (const [k, entries,] of prefixHits.slice(0, 20,)) {
      console.log(`  ${k}`,);
      for (const e of entries) {
        console.log(`    [${e.kind}] ${e.source}`,);
      }
    }
    return;
  }
  console.log(`${norm} — not referenced by any plan/spec`,);
}

function reportStale(map: CodeMap,): number {
  let stale = 0;
  for (const path of Object.keys(map,)) {
    const abs = join(PROJECT_ROOT, path,);
    if (!existsSync(abs,)) {
      stale++;
      const owners = map[path]!.map((e,) => `${e.kind}:${e.source}`).join(", ",);
      console.error(`[code-map] stale src ref: ${path} (referenced by ${owners})`,);
    }
  }
  return stale;
}

/** Regenerate in-memory and diff against the committed file (freshness gate). */
function verifyFresh(map: CodeMap,): boolean {
  if (!existsSync(MAP_PATH,)) {
    console.error(`[code-map] ${MAP_PATH} missing — run \`bun run plan:map\``,);
    return false;
  }
  const committed = readMap();
  const a = JSON.stringify(map, null, 2,);
  const b = JSON.stringify(committed, null, 2,);
  if (a !== b) {
    console.error(
      `[code-map] ${MAP_PATH} is stale — run \`bun run plan:map\` to regenerate`,
    );
    return false;
  }
  return true;
}

function main(): void {
  const args = process.argv.slice(2,);

  if (args.includes("--find",)) {
    const idx = args.indexOf("--find",);
    const path = args[idx + 1];
    if (!path) {
      console.error("usage: plan-code-map --find <src/path>",);
      process.exit(1,);
    }
    if (!existsSync(MAP_PATH,)) {
      console.error(`[code-map] index missing — run \`bun run scripts/plan-code-map.ts\` first`,);
      process.exit(1,);
    }
    findOwners(path,);
    return;
  }

  const map = buildMap();
  writeFileSync(MAP_PATH, JSON.stringify(map, null, 2,) + "\n",);
  console.log(`[code-map] wrote ${MAP_PATH} (${Object.keys(map,).length} src paths)`,);

  if (args.includes("--check",)) {
    // Freshness gate: committed index must match a fresh rebuild.
    if (!verifyFresh(map,)) { process.exit(1,); }
    console.log("[code-map] OK — index is up to date",);
  } else if (args.includes("--stale",)) {
    const stale = reportStale(map,);
    if (stale > 0) {
      console.error(`\n[code-map] ${stale} stale src reference(s) — advisory (future/renamed files)`,);
    } else {
      console.log("[code-map] OK — all src references resolve",);
    }
  }
}

main();
