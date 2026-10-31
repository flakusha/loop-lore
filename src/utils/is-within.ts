// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/utils/is-within.ts — filesystem containment guard
// (epic-browser-editor-support; no path guard existed in src/ before this).

import fs from "node:fs";
import { resolve, sep, } from "node:path";

/**
 * Resolve a path for containment checks: the real path when it exists (so a
 * symlink inside the root that points outside fails), the lexical absolute
 * path otherwise (new files have no realpath yet).
 * @param p - candidate path.
 * @returns the resolved path.
 */
function resolveForContainment(p: string,): string {
  try {
    return fs.realpathSync(p,);
  } catch {
    // Not on disk (yet) — lexical resolution is the best available truth.
    return resolve(p,);
  }
}

/**
 * True when `candidate` is `root` itself or lies underneath it. Symlinks are
 * resolved when they exist, so a link inside the root that escapes it fails;
 * `..` segments and absolute candidates are normalized before the check.
 * @param root - absolute root directory.
 * @param candidate - path to test (absolute or relative to cwd).
 */
export function isWithin(root: string, candidate: string,): boolean {
  const resolvedRoot = resolveForContainment(root,);
  const resolved = resolveForContainment(candidate,);
  return resolved === resolvedRoot || resolved.startsWith(resolvedRoot + sep,);
}
