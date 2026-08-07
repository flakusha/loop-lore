/**
 * Canonical map key for an ordered system pair.
 *
 * Shared by the `addEdge` (register) and `getEdge` (query) dispatchers so both
 * sides agree on how an edge is keyed, independent of argument order.
 */
import type { SystemId, } from "./types";

/** Internally canonical key for a source→target pair. */
export function edgeKey(a: SystemId, b: SystemId,): string {
  return `${a}→${b}`;
}
