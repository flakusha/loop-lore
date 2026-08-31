// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Canonical map key for an ordered system pair.
 *
 * Shared by the `addEdge` (register) and `getEdge` (query) dispatchers so both
 * sides agree on how an edge is keyed, independent of argument order.
 */
import type { SystemId, } from "./types";

/**
 * Internally canonical key for a source→target pair.
 * @param a
 * @param b
 */
export function edgeKey(a: SystemId, b: SystemId,): string {
  return `${a}→${b}`;
}
