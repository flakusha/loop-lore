// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Anchor a configured path to the runtime instance dir.
 *
 * The shipped path defaults are DATA_DIR-anchored, but DATA_DIR freezes at
 * import time — before the effective server bind is known — so its slug is
 * "default" while the runtime instance dir is "port-<port>". A configured
 * path that lies under the frozen DATA_DIR (or carries the portable
 * `${DATA_DIR}` placeholder the published schema emits) is therefore
 * re-anchored onto the runtime instance dir, preserving the remainder.
 * Every other absolute path is the operator's explicit choice and is used
 * verbatim.
 */

import path from "node:path";
import { DATA_DIR, } from "./constants";

/** Portable placeholder the published config schema uses for the data dir. */
export const DATA_DIR_PLACEHOLDER = "${DATA_DIR}";

/** Options for {@link resolveInstancePath}. */
export interface ResolveInstancePathOptions {
  /** The runtime instance dir the path is anchored to. */
  instanceDir: string;
}

/**
 * Resolve a configured path against the runtime instance dir.
 * @param value - relative, absolute, or `${DATA_DIR}`-anchored path
 * @param opts
 * @returns the absolute path inside the runtime instance dir, or `value` verbatim
 */
export function resolveInstancePath(value: string, opts: ResolveInstancePathOptions,): string {
  const instanceDir = opts.instanceDir;

  if (value === DATA_DIR_PLACEHOLDER) { return instanceDir; }

  if (value.startsWith(`${DATA_DIR_PLACEHOLDER}/`,)) {
    return path.join(instanceDir, value.slice(DATA_DIR_PLACEHOLDER.length + 1,),);
  }

  if (!path.isAbsolute(value,)) { return path.join(instanceDir, value,); }

  // Under the import-frozen DATA_DIR: re-anchor, preserving the remainder.
  const remainder = path.relative(DATA_DIR, value,);
  if (remainder === "") { return instanceDir; }
  if (remainder.startsWith("..",) || path.isAbsolute(remainder,)) { return value; }

  return path.join(instanceDir, remainder,);
}
