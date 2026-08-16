// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * gen-deno-config.ts — Idempotent, in-place `deno.json` generator.
 *
 * Reads `package.json` and emits a `deno.json` (import map + tasks) so the
 * project can ALSO run under Deno. Re-running produces byte-identical output
 * (deterministic key ordering, no volatile fields) — safe to wire into a
 * check gate. No source changes: `bun:`-specific APIs (bun:sqlite, Bun.serve)
 * still require manual source work and are intentionally NOT shimmed here.
 *
 * Runs under both Bun and Deno (only `node:*` builtins are used).
 *
 * Usage:
 *   bun run scripts/gen-deno-config.ts            # write deno.json in place
 *   bun run scripts/gen-deno-config.ts --dry-run  # print to stdout
 *   bun run scripts/gen-deno-config.ts --check    # exit 1 if stale/missing
 */

import { existsSync, readFileSync, writeFileSync, } from "node:fs";
import { resolve, } from "node:path";
import process from "node:process";

interface PackageJson {
  name?: string;
  version?: string;
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [key: string]: unknown;
}

interface DenoConfig {
  nodeModulesDir: "auto";
  imports: Record<string, string>;
  tasks: Record<string, string>;
  compilerOptions: Record<string, unknown>;
  unstable: string[];
  [key: string]: unknown;
}

/**
 * Transform a single shell segment (no operators) from Bun to Deno runners.
 * Rules (documented, conservative — falls back to `bun` when Deno lacks the
 * subcommand so generated tasks stay runnable):
 *   - `bun run <script>`        → `deno task <script>`   (deno task chaining)
 *   - `bun run <file.ts>`       → `deno run <file.ts>`   (file present)
 *   - `bunx <pkg> [args]`       → `deno run -A npm:<pkg> [args]`
 *   - `bun test ...`            → `deno test ...`
 *   - `bun <other> ...`         → `deno <other> ...`  (except `bun build`)
 *   - anything else             → unchanged
 */
function transformSegment(seg: string, scriptNames: Set<string>,): string {
  const s = seg.trim();
  if (!s) { return s; }

  const run = /^bun\s+run\s+(.+)$/.exec(s,);
  if (run) {
    const rest = run[1]!.trim();
    const looksLikeFile = /(^|\/)[^\s]+\.(ts|mts|cts|mjs|cjs|js|json)$/.test(rest,) || rest.includes("/",);
    if (looksLikeFile) { return `deno run ${rest}`; }
    return `deno task ${rest}`;
  }

  const bunx = /^bunx\s+(.+)$/.exec(s,);
  if (bunx) { return `deno run -A npm:${bunx[1]!.trim()}`; }

  const test = /^bun\s+test\b/.exec(s,);
  if (test) { return s.replace(/^bun/, "deno",); }

  const bare = /^bun\s+(.+)$/.exec(s,);
  if (bare) {
    const sub = bare[1]!.trim();
    // `bun build` has no Deno equivalent subcommand — delegate to bun.
    if (sub.startsWith("build",)) { return s; }
    return `deno ${sub}`;
  }

  void scriptNames;
  return s;
}

/** Transform a full command, preserving && / || / ; / | operators + spacing. */
export function transformCommand(cmd: string, scriptNames: Set<string>,): string {
  const tokens = cmd.split(/(\s*\|\|\s*|\s*&&\s*|\s*;\s*|\s*\|\s*)/,);
  return tokens
    .map((tok, i,) => {
      // Odd indices are the captured operators — leave untouched.
      if (i % 2 === 1) { return tok; }
      return transformSegment(tok, scriptNames,);
    },)
    .join("",);
}

/** Recursively sort object keys for deterministic serialization. */
function sortKeys(value: unknown,): unknown {
  if (Array.isArray(value,)) { return value.map(sortKeys,); }
  if (value && typeof value === "object" && value.constructor === Object) {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>,).sort()) {
      out[key] = sortKeys((value as Record<string, unknown>)[key],);
    }
    return out;
  }
  return value;
}

/** Stable, sorted, 2-space JSON with a trailing newline. */
export function stableStringify(obj: unknown,): string {
  return `${JSON.stringify(sortKeys(obj,), null, 2,)}\n`;
}

/**
 * Build the deterministic `deno.json` object from a package.json.
 * Pure — no I/O. Safe to call repeatedly; output is byte-stable.
 */
export function buildDenoConfig(pkg: PackageJson,): DenoConfig {
  const deps = pkg.dependencies ?? {};
  const devDeps = pkg.devDependencies ?? {};
  const allDeps = { ...deps, ...devDeps, };

  const imports: Record<string, string> = {};
  for (const [name, version,] of Object.entries(allDeps,)) {
    imports[name] = `npm:${name}@${version}`;
  }

  const scriptNames = new Set(Object.keys(pkg.scripts ?? {},),);
  const tasks: Record<string, string> = {};
  for (const [name, cmd,] of Object.entries(pkg.scripts ?? {},)) {
    tasks[name] = transformCommand(cmd, scriptNames,);
  }

  return {
    nodeModulesDir: "auto",
    imports,
    tasks,
    compilerOptions: {
      strict: true,
      lib: ["deno.window", "DOM", "ESNext",],
    },
    unstable: ["sloppy-imports",],
  };
}

// ── CLI ────────────────────────────────────────────────────────────────────
if (import.meta.main) {
  const argv = process.argv.slice(2,);
  const dryRun = argv.includes("--dry-run",);
  const check = argv.includes("--check",);

  const root = resolve(process.cwd(),);
  const pkgPath = resolve(root, "package.json",);
  const outPath = resolve(root, "deno.json",);

  const pkg = JSON.parse(readFileSync(pkgPath, "utf8",),) as PackageJson;
  const out = stableStringify(buildDenoConfig(pkg,),);

  if (check) {
    if (!existsSync(outPath,)) {
      process.stderr.write("deno.json missing — run gen-deno-config\n",);
      process.exit(1,);
    }
    const existing = readFileSync(outPath, "utf8",);
    if (existing !== out) {
      process.stderr.write("deno.json is stale — run gen-deno-config\n",);
      process.exit(1,);
    }
    process.stdout.write("deno.json up to date\n",);
    process.exit(0,);
  }

  if (dryRun) {
    process.stdout.write(out,);
    process.exit(0,);
  }

  writeFileSync(outPath, out,);
  process.stdout.write(`Wrote ${outPath}\n`,);
}
