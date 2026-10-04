// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/cron/dag/graph.ts — DAG adjacency + cycle probe
 *
 * Split out of ./engine.ts to keep that file a scheduler rather than a
 * pile of traversals. Owns both directions of the edge set:
 *   - forward (`#deps`)       — what a node waits on, for eligibility;
 *   - reverse (`#dependents`) — who waits on a node, with each one's
 *     failure policy, for propagation.
 *
 * Pure graph: no DB, no task bodies, no node execution state.
 */

import type { FailurePolicy, } from "./types";

/** Ceiling on nodes walked per reachability probe, so a corrupt graph
 *  cannot spin forever. ponytail: iterative DFS with a visited set is
 *  right up to a few thousand nodes; past that, maintain a topological
 *  order incrementally and compare ranks instead of walking.
 */
const MAX_PROBE_NODES = 10_000;

/**
 * Does `from` already depend on `to` (directly or transitively)?
 *
 * Iterative DFS with a visited set. The visited set is what makes a
 * diamond terminate: with B and C both waiting on D, D is expanded once.
 * @param edges forward adjacency, node → what it waits on
 * @param from the node to start the walk at
 * @param to the node being sought
 * @returns true when `to` is reachable from `from`
 * @throws {Error} when the walk exceeds `MAX_PROBE_NODES`, which a
 *   graph built through `link` cannot do — reported, not assumed.
 */
export function reaches(
  edges: ReadonlyMap<string, Set<string>>,
  from: string,
  to: string,
): boolean {
  if (from === to) { return true; }
  const seen = new Set<string>([from,],);
  const stack: string[] = [from,];
  let visited = 0;
  while (stack.length > 0) {
    const node = stack.pop();
    if (node === undefined) { break; }
    if (++visited > MAX_PROBE_NODES) {
      throw new Error(
        `DAG reachability probe exceeded ${MAX_PROBE_NODES} nodes from "${from}"; graph is corrupt`,
      );
    }

    for (const next of edges.get(node,) ?? []) {
      if (next === to) { return true; }
      if (seen.has(next,)) { continue; }
      seen.add(next,);
      stack.push(next,);
    }
  }

  return false;
}

/**
 * In-memory adjacency for one workflow graph, with cycle-safe insertion.
 *
 * The edge is refused BEFORE it is stored, so a rejected insert cannot
 * leave a half-added edge behind.
 */
export class DagGraph {
  /** node → nodes it waits on. */
  readonly #deps = new Map<string, Set<string>>();
  /** node → dependents, each with its failure policy. */
  readonly #dependents = new Map<string, Map<string, FailurePolicy>>();
  /** Every node mentioned by any edge, roots included. */
  readonly #known = new Set<string>();

  /** Every node in the graph, sorted for a stable pass order. */
  nodes(): string[] {
    return [...this.#known,].toSorted((a, b,) => a.localeCompare(b,));
  }

  /**
   * Declare a node that has no dependencies.
   *
   * A root is a real node, not an absence: without this it never enters
   * `#known`, so a task whose body is registered but which no edge
   * mentions would be invisible to the pass and would silently never
   * run. `link` registers its two endpoints automatically, so this is
   * only needed for a node that genuinely depends on nothing.
   * @param taskId
   */
  declare(taskId: string,): void {
    this.#known.add(taskId,);
  }

  /** Nodes `taskId` waits on. Empty for a root. */
  dependsOn(taskId: string,): string[] {
    const deps = this.#deps.get(taskId,) ?? new Set<string>();
    return [...deps,].toSorted((a, b,) => a.localeCompare(b,));
  }

  /** Would `taskId` running on `dependsOnTaskId` close a cycle? */
  wouldCycle(taskId: string, dependsOnTaskId: string,): boolean {
    return reaches(this.#deps, dependsOnTaskId, taskId,);
  }

  /**
   * Record an edge in both directions. Assumes the caller has already
   * rejected the cycle — `wouldCycle` is the check, this is the write.
   * @param taskId the blocked node
   * @param dependsOnTaskId the node it waits for
   * @param onFailure the dependent's policy if the prerequisite fails
   */
  link(taskId: string, dependsOnTaskId: string, onFailure: FailurePolicy,): void {
    let deps = this.#deps.get(taskId,);
    if (deps === undefined) {
      deps = new Set<string>();
      this.#deps.set(taskId, deps,);
    }

    deps.add(dependsOnTaskId,);

    let dependents = this.#dependents.get(dependsOnTaskId,);
    if (dependents === undefined) {
      dependents = new Map<string, FailurePolicy>();
      this.#dependents.set(dependsOnTaskId, dependents,);
    }

    dependents.set(taskId, onFailure,);

    this.#known.add(taskId,);
    this.#known.add(dependsOnTaskId,);
  }

  /**
   * The `skip` dependents of `taskId`, excluding any already finished.
   * `retry` dependents are filtered out by the caller-supplied
   * `isFinished` predicate rather than here, because a `retry`
   * dependent must survive its prerequisite's failure.
   * @param taskId the node that failed or was skipped
   * @param isFinished dependent → already `done` or `skipped`
   * @returns the dependents to skip, in graph order
   */
  skipDependents(taskId: string, isFinished: (dependent: string,) => boolean,): string[] {
    const out: string[] = [];
    const dependents = this.#dependents.get(taskId,) ?? new Map<string, FailurePolicy>();
    for (const [dependent, policy,] of dependents) {
      if (policy !== "skip" || isFinished(dependent,)) { continue; }
      out.push(dependent,);
    }

    return out.toSorted((a, b,) => a.localeCompare(b,));
  }

  /** True when every prerequisite of `taskId` is `done`. A root has no
   *  prerequisites and is trivially satisfied.
   * @param taskId
   * @param isDone dependency → currently `done`
   */
  isUnblocked(taskId: string, isDone: (dep: string,) => boolean,): boolean {
    for (const dep of this.#deps.get(taskId,) ?? []) {
      if (!isDone(dep,)) { return false; }
    }

    return true;
  }
}
