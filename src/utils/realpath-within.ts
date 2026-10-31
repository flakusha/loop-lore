// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shared path-containment primitive: realpath through the nearest EXISTING
 * ancestor.
 *
 * `resolveReal` resolves a path to its real (symlink-free) absolute form.
 * When the path itself does not exist (the create case), it walks up to the
 * nearest existing ancestor, realpaths that, and re-appends the
 * still-missing tail — tail components cannot be symlinks because they do
 * not exist, while an intermediate directory symlink IS resolved and can
 * therefore be caught by a containment check.
 *
 * `realpathSync` is imported as a static named import: as probed and
 * documented in `src/assistant/guard/sandbox.ts`, such an import binds the
 * function at module-link time, before the guard sandbox can patch the
 * `node:fs` module objects, so this helper always sees the native realpath
 * regardless of module load order and cannot recurse through the sandbox's
 * own fs interceptors.
 *
 * @module realpath-within
 */
import { realpathSync, } from "node:fs";
import { basename, dirname, join, resolve, sep, } from "node:path";

/**
 * Resolve a path to its real (symlink-free) absolute form.
 *
 * Returns null when the path (or any existing ancestor) cannot be resolved,
 * so callers can treat resolution failure as DENY.
 * @param input - Path to resolve.
 * @returns The real absolute path, or null on failure.
 */
export function resolveReal(input: string,): string | null {
  const absolute = resolve(input,);
  try {
    return realpathSync(absolute,);
  } catch {
    // Walk up to the nearest existing ancestor, realpath it, then re-append
    // the (still-missing) tail. Any resolution error denies.
    let current = absolute;
    const tail: string[] = [];
    while (true) {
      const parent = dirname(current,);
      if (parent === current) {
        try {
          return realpathSync(current,);
        } catch {
          return null;
        }
      }

      tail.unshift(basename(current,),);
      current = parent;
      try {
        const realParent = realpathSync(current,);
        return tail.length === 0 ? realParent : join(realParent, ...tail,);
      } catch {
        // keep walking up
      }
    }
  }
}

/**
 * True when `candidate` is `root` itself or lies underneath it, judged after
 * symlink resolution on both sides (see {@link resolveReal}). An intermediate
 * directory symlink that leaves the root is rejected even when the
 * candidate's final component does not exist yet; a path that cannot be
 * resolved at all fails closed.
 * @param root - Absolute root directory (expected to exist).
 * @param candidate - Path to test (absolute or relative to cwd).
 * @returns true when the candidate is contained.
 */
export function isWithinReal(root: string, candidate: string,): boolean {
  const resolvedRoot = resolveReal(root,);
  if (resolvedRoot === null) { return false; }
  const resolved = resolveReal(candidate,);
  if (resolved === null) { return false; }
  return resolved === resolvedRoot || resolved.startsWith(`${resolvedRoot}${sep}`,);
}
