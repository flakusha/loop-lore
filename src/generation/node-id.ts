// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Allocate a node id that is guaranteed not to collide with an existing one.
 *
 * ComfyUI node ids are **opaque strings**. Exporters emit bare integers ("12"),
 * but some emit grouped ids ("60:45"). `Number("60:45")` is `NaN`, so the
 * previous `Math.max(...Object.keys(nodes).map(Number)) + 1` collapsed every key
 * of such a graph to a single node keyed `"NaN"`. Reading the *leading integer
 * run* instead is well-defined for every id shape seen in the wild.
 *
 * The result is provably free: if some key equalled `String(max + 1)` then its
 * leading run would be `max + 1`, which would have pushed `max` higher. So
 * `max + 1` can match neither a whole key nor any key's leading run.
 *
 * @param reserved - Ids already in use (or claimed for nodes not yet built)
 * @returns {string}
 */
export function allocateNodeId(reserved: Iterable<string>,): string {
  let max = 0;
  for (const key of reserved) {
    const leading = Number.parseInt(key, 10,);
    if (Number.isFinite(leading,) && leading > max) { max = leading; }
  }

  return String(max + 1,);
}
