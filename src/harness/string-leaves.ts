// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shared depth-limited string walk for the two scope policies: the ACP
 * permission classifier and the plugin-tool parameter guard. One recursion
 * skeleton keeps their truncation and path-key accounting from drifting.
 */

/** Key names whose string value is treated as a filesystem target. */
export const PATH_KEY_PATTERN = /path|file|dir|glob|target/i;

/** Result of a bounded string walk. */
export interface StringLeaves {
  leaves: string[];
  truncated: boolean;
}

/**
 * Collect string leaves below `value`, with a fixed descent budget.
 * @param value - Raw JSON value.
 * @param depth - Remaining descent budget.
 * @param underPathKey - Whether a path-bearing key was seen above.
 * @param pathKeyOnly - Collect only leaves under a path-bearing key.
 * @returns Leaves plus whether any content was skipped.
 */
export function walkStringLeaves(
  value: unknown,
  depth: number,
  underPathKey: boolean,
  pathKeyOnly: boolean,
): StringLeaves {
  if (typeof value === "string") {
    return { leaves: !pathKeyOnly || underPathKey ? [value,] : [], truncated: false, };
  }

  if (depth <= 0) { return { leaves: [], truncated: true, }; }
  if (Array.isArray(value,) || (value !== null && typeof value === "object")) {
    const entries = Array.isArray(value,)
      ? value.map((v,) => [null, v,] as const)
      : Object.entries(value,);

    const leaves: string[] = [];
    let truncated = false;
    for (const [key, v,] of entries) {
      const inner = walkStringLeaves(
        v,
        depth - 1,
        underPathKey || (key !== null && PATH_KEY_PATTERN.test(key,)),
        pathKeyOnly,
      );

      leaves.push(...inner.leaves,);
      truncated = truncated || inner.truncated;
    }

    return { leaves, truncated, };
  }

  return { leaves: [], truncated: false, };
}
