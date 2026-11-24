// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * One source of truth for test roots and source-path bucketing. Gate chunks,
 * coverage reporters and diff scoping import this instead of repeating
 * `src/` / `packages/core/` literals that silently go stale on a package cut.
 */

// oxlint-disable-next-line import/no-nodejs-modules
import { existsSync, readdirSync, statSync, } from "node:fs";
// oxlint-disable-next-line import/no-nodejs-modules
import path from "node:path";

/** Canonical roots for the four test chunks; `packages` feeds the src chunk. */
export const TEST_ROOTS = Object.freeze({
  e2e: "tests/e2e/",
  packages: "packages",
  plugins: "plugins",
  scripts: "scripts",
  src: "src",
},);

/** Source roots for repo-wide scanners (jscpd, madge); package roots cover workspace src trees. */
export const SOURCE_ROOTS = Object.freeze(["src/", "packages/",],);

const SOURCE_PREFIX = /^(?:packages\/([^/]+)\/)?src\//;

/**
 * Module bucket for a source or lcov path. Core keeps its historical flat
 * bucket; other workspaces get a `pkg:` prefix so floors cannot collide.
 * @param {string} filePath - repo-relative source path
 * @returns {string} module bucket
 */
export function moduleName(filePath,) {
  const match = SOURCE_PREFIX.exec(filePath,);
  const rest = match ? filePath.slice(match[0].length,) : filePath;
  const seg = rest.split("/",)[0];
  const base = seg.includes(".",) ? "(root)" : seg;
  return match?.[1] && match[1] !== "core" ? `${match[1]}:${base}` : base;
}

/**
 * Recursively collect every `*.test.ts` under `root/dir`, returned as
 * repo-relative paths, sorted for deterministic command lines.
 * @param {string} root - repo root
 * @param {string} dir - repo-relative directory (or a single test file)
 * @returns {string[]} matching test paths
 */
export function walkTestFiles(root, dir,) {
  const out = [];
  const abs = path.resolve(root, dir,);
  if (!existsSync(abs,)) { return out; }
  // Diff-derived targets can be files (e.g. root-level src/*.ts) — only walk dirs.
  if (!statSync(abs,).isDirectory()) { return abs.endsWith(".test.ts",) ? [dir,] : out; }
  const stack = [abs,];
  while (stack.length > 0) {
    const cur = stack.pop();
    for (const entry of readdirSync(cur, { withFileTypes: true, },)) {
      const full = path.join(cur, entry.name,);
      if (entry.isDirectory()) {
        stack.push(full,);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith(".test.ts",)) {
        out.push(path.relative(root, full,),);
      }
    }
  }
  return out.sort();
}
