// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * File discovery for the SPDX header guard: extension allowlist, exclusion
 * patterns, and git-backed file listing (staged / tracked).
 */
import { $, } from "bun";

/** Extension allowlist: a file is checkable iff its extension is a key here. */
const HAS_CHECKABLE_EXTENSION: Record<string, true> = {
  ".ts": true,
  ".tsx": true,
  ".js": true,
  ".mjs": true,
  ".html": true,
  ".css": true,
  ".md": true,
  ".mdx": true,
};

const EXCLUDE_PATTERNS = [
  /\/migrations\//,
  /\/node_modules\//,
  /\/dist\//,
  /\.d\.ts$/,
  /\.test\.[jt]sx?$/,
  /\.spec\.[jt]sx?$/,
  // Auto-generated DB artifacts (owned by generate-db-types.ts /
  // generate-schema-manifest.ts) — the generators do not emit SPDX headers,
  // so adding them here would make the `db - schema gate` report STALE.
  /^src\/db\/schema(?:-[a-z]+)?\.ts$/,
  /^src\/test-utils\/insert-helpers\.ts$/,
  /^src\/validation\/db-schemas\.ts$/,
];

export function isExcluded(filePath: string,): boolean {
  return EXCLUDE_PATTERNS.some((p,) => p.test(filePath,));
}

export function hasCheckableExtension(filePath: string,): boolean {
  const ext = filePath.slice(filePath.lastIndexOf(".",),);
  return HAS_CHECKABLE_EXTENSION[ext] === true;
}

export async function getStagedFiles(): Promise<string[]> {
  const result = await $`git diff --cached --name-only --diff-filter=ACM`.text();
  return result
    .split("\n",)
    .filter((f,) => f.trim().length > 0)
    .filter(hasCheckableExtension,)
    .filter((f,) => !isExcluded(f,));
}

/** List every tracked file (git ls-files) with a checkable extension. */
export async function getTrackedFiles(): Promise<string[]> {
  const result = await $`git ls-files`.text();
  return result
    .split("\n",)
    .filter((f,) => f.trim().length > 0)
    .filter(hasCheckableExtension,)
    .filter((f,) => !isExcluded(f,));
}
