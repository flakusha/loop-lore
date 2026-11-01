// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/utils/is-within.ts — filesystem containment guard
// (epic-browser-editor-support; no path guard existed in src/ before this).
//
// Resolution is delegated to the shared nearest-existing-ancestor realpath
// helper (`./realpath-within`) — one algorithm serves the harness scope
// guard (`src/harness/worktree-scope.ts`), the assistant sandbox, and this
// route-level check.

import { isWithinReal, } from "./realpath-within";

/**
 * True when `candidate` is `root` itself or lies underneath it. Both paths
 * are judged through their nearest-existing-ancestor realpath, so a symlink
 * inside the root that escapes it fails, and an intermediate directory
 * symlink is caught even when the candidate's final component does not
 * exist yet. `..` segments and absolute candidates are normalized before
 * the check; a path that cannot be resolved at all fails closed.
 * @param root - absolute root directory (expected to exist).
 * @param candidate - path to test (absolute or relative to cwd).
 */
export function isWithin(root: string, candidate: string,): boolean {
  return isWithinReal(root, candidate,);
}
