// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * gen-pkg-from-deno.ts — Reverse config generator (deno.json → package.json).
 *
 * Reads a `deno.json` and patches `package.json` scripts with the Bun-
 * equivalent commands. The inverse of gen-deno-config.ts.
 *
 * Only touches the `scripts` field — dependencies and other fields are
 * left as-is. Re-running produces identical output (deterministic).
 *
 * Runs under both Bun and Deno (only `node:*` builtins used).
 *
 * Usage:
 *   bun run scripts/gen-pkg-from-deno.ts            # write package.json
 *   bun run scripts/gen-pkg-from-deno.ts --dry-run  # print scripts to stdout
 *   bun run scripts/gen-pkg-from-deno.ts --check    # exit 1 if stale
 */

import { existsSync, readFileSync, writeFileSync, } from "node:fs";
import { resolve, } from "node:path";
import process from "node:process";

interface DenoConfig {
  tasks?: Record<string, string>;
  imports?: Record<string, string>;
  [key: string]: unknown;
}

interface PackageJson {
  scripts?: Record<string, string>;
  [key: string]: unknown;
}

/**
 * Transform a single shell segment from Deno to Bun runners.
 * Inverse of gen-deno-config.ts transformSegment.
 *
 * Rules:
 *   - `deno task <script>`          → `bun run <script>`
 *   - `deno run <file>`             → `bun run <file>`
 *   - `deno test ...`               → `bun test ...`
 *   - `deno run -A npm:<pkg> ...`   → `bunx <pkg> ...`
 *   - `deno <other> ...`            → `bun <other> ...`  (except `deno build`)
 *   - anything else                 → unchanged
 */
export function transformSegment(seg: string,): string {
  const s = seg.trim();
  if (!s) { return s; }

  // deno run -A npm:<pkg> [args] → bunx <pkg> [args]
  const npmRun = /^deno\s+run\s+-A\s+npm:(.+)$/.exec(s,);
  if (npmRun) { return `bunx ${npmRun[1]!.trim()}`; }

  // deno run <file> → bun run <file>
  const fileRun = /^deno\s+run\s+(.+)$/.exec(s,);
  if (fileRun) {
    const rest = fileRun[1]!.trim();
    const looksLikeFile = /(^|\/)[^\s]+\.(ts|mts|cts|mjs|cjs|js|json)$/.test(rest,) || rest.includes("/",);
    if (looksLikeFile) { return `bun run ${rest}`; }
    return `bun run ${rest}`;
  }

  // deno task <script> → bun run <script>
  const task = /^deno\s+task\s+(.+)$/.exec(s,);
  if (task) { return `bun run ${task[1]!.trim()}`; }

  // deno test → bun test
  const test = /^deno\s+test\b/.exec(s,);
  if (test) { return s.replace(/^deno/, "bun",); }

  // deno <other> → bun <other>  (except build — no bun equivalent for deno build)
  const bare = /^deno\s+(.+)$/.exec(s,);
  if (bare) {
    const sub = bare[1]!.trim();
    if (sub.startsWith("build",)) { return s; }
    return `bun ${sub}`;
  }

  return s;
}

/** Transform a full command, preserving && / || / ; / | operators. */
export function transformCommand(cmd: string,): string {
  const tokens = cmd.split(/(\s*\|\|\s*|\s*&&\s*|\s*;\s*|\s*\|\s*)/,);
  return tokens
    .map((tok, i,) => {
      if (i % 2 === 1) { return tok; }
      return transformSegment(tok,);
    },)
    .join("",);
}

/**
 * Build package.json scripts from deno.json tasks.
 * Pure — no I/O. Only maps the `tasks` field.
 */
export function buildPkgScripts(deno: DenoConfig,): Record<string, string> {
  const scripts: Record<string, string> = {};
  for (const [name, cmd,] of Object.entries(deno.tasks ?? {},)) {
    scripts[name] = transformCommand(cmd,);
  }
  return scripts;
}

// ── CLI ────────────────────────────────────────────────────────

if (import.meta.main) {
  const argv = process.argv.slice(2,);
  const dryRun = argv.includes("--dry-run",);
  const check = argv.includes("--check",);

  const root = resolve(process.cwd(),);
  const denoPath = resolve(root, "deno.json",);
  const pkgPath = resolve(root, "package.json",);

  if (!existsSync(denoPath,)) {
    process.stderr.write("deno.json not found\n",);
    process.exit(1,);
  }

  const deno = JSON.parse(readFileSync(denoPath, "utf8",),) as DenoConfig;
  const scripts = buildPkgScripts(deno,);

  if (dryRun) {
    process.stdout.write(JSON.stringify(scripts, null, 2,) + "\n",);
    process.exit(0,);
  }

  if (!existsSync(pkgPath,)) {
    process.stderr.write("package.json not found\n",);
    process.exit(1,);
  }

  const pkg = JSON.parse(readFileSync(pkgPath, "utf8",),) as PackageJson;
  const merged = { ...pkg.scripts, ...scripts, };

  if (check) {
    const current = JSON.stringify(pkg.scripts ?? {}, null, 2,);
    const expected = JSON.stringify(merged, null, 2,);
    if (current !== expected) {
      process.stderr.write("package.json scripts stale — run gen-pkg-from-deno\n",);
      process.exit(1,);
    }
    process.stdout.write("package.json scripts up to date\n",);
    process.exit(0,);
  }

  pkg.scripts = merged;
  const out = JSON.stringify(pkg, null, 2,) + "\n";
  writeFileSync(pkgPath, out,);
  process.stdout.write(`Patched ${pkgPath} scripts from deno.json\n`,);
}
