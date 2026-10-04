// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/cron/dag/edges.ts — graph integrity: cycle-safe edge insertion
 *
 * The write side of the DAG, split from the pass loop in ./engine.ts.
 * The engine owns a graph and a node table; this file owns what may go
 * INTO them. The rule it enforces is the one that makes a pass safe to
 * write: no caller can persist a circular graph the pass would then
 * deadlock on.
 *
 * The rejection happens BEFORE the insert, so a refused edge leaves the
 * graph and the `task_dependencies` table exactly as they were — there is
 * no partial write to roll back. The INSERT itself is ./store.ts.
 */

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { jsonStringifyOr, } from "../../utils";
import type { DagGraph, } from "./graph";
import type { NodeStates, } from "./nodes";
import { loadDependencies, saveDependency, } from "./store";
import type { FailurePolicy, } from "./types";

/**
 * Record that `taskId` waits on `dependsOnTaskId`.
 *
 * Rejects an insert that would close a cycle: if `dependsOnTaskId`
 * already reaches `taskId`, the edge would leave both nodes with an
 * unmet prerequisite and the pass would deadlock. Thrown BEFORE the
 * insert, so existing rows are untouched — a rejected edge leaves the
 * graph and the table exactly as they were.
 *
 * Re-adding an existing pair updates its policy rather than
 * duplicating the row (the composite PK makes the edge unique).
 *
 * @param db
 * @param graph adjacency to link into
 * @param states node table to register both endpoints in
 * @param taskId the blocked node
 * @param dependsOnTaskId the node it waits for
 * @param onFailure what to do with `taskId` when the prerequisite fails
 * @throws {Error} when the edge would close a cycle, or when the two
 *   ids are equal (the degenerate self-cycle)
 * @returns {Promise<void>}
 */
export async function addEdge(
  db: Kysely<DB>,
  graph: DagGraph,
  states: NodeStates,
  taskId: string,
  dependsOnTaskId: string,
  onFailure: FailurePolicy = "skip",
): Promise<void> {
  if (taskId === dependsOnTaskId) {
    throw new Error(`task ${jsonStringifyOr(taskId,)} cannot depend on itself`,);
  }

  if (graph.wouldCycle(taskId, dependsOnTaskId,)) {
    throw new Error(
      `cycle rejected: ${jsonStringifyOr(taskId,)} -> ${jsonStringifyOr(dependsOnTaskId,)} — ` +
        `${jsonStringifyOr(dependsOnTaskId,)} already depends on ` +
        `${jsonStringifyOr(taskId,)} (directly or transitively)`,
    );
  }

  await saveDependency(db, taskId, dependsOnTaskId, onFailure,);

  graph.link(taskId, dependsOnTaskId, onFailure,);
  states.touch(taskId,);
  states.touch(dependsOnTaskId,);
}

/**
 * Load the persisted edges into a graph and node table.
 *
 * Node state is deliberately NOT restored — only the edges. A
 * restarted process has no memory of which nodes completed, so every
 * node comes back `blocked` and the pass re-derives progress. That is
 * the safe direction: work may run twice, never silently never.
 *
 * @param db
 * @param graph adjacency to link into
 * @param states node table to register both endpoints in
 * @returns {Promise<void>}
 */
export async function hydrateEdges(
  db: Kysely<DB>,
  graph: DagGraph,
  states: NodeStates,
): Promise<void> {
  for (const edge of await loadDependencies(db,)) {
    graph.link(edge.taskId, edge.dependsOnTaskId, edge.onFailure,);
    states.touch(edge.taskId,);
    states.touch(edge.dependsOnTaskId,);
  }
}
