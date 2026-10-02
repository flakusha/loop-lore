// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/cron/dag/engine.ts — Workflow DAG engine
 *
 * Sits ON TOP of the shipped cron scheduler, not beside it. The engine
 * owns no timer and no loop: `runPass()` is a plain call the existing
 * `autonomy.world-tick` job (src/cron/jobs.ts) reaches through the
 * `AutonomyDispatch` seam, so dependency-ordered dispatch inherits the
 * registry's single lifecycle, error wrapper, and status surface instead
 * of forking a second scheduler.
 *
 * Two responsibilities:
 *   1. Graph integrity — `addDependency` refuses an edge that would
 *      close a cycle, at insert time, so no caller can persist a
 *      circular graph the pass would then deadlock on.
 *   2. Execution — `runPass` dispatches only unblocked nodes, honors
 *      each edge's `on_failure` policy, and cascades `skip`
 *      transitively.
 *
 * Edges live in `task_dependencies`; per-node state is in memory. That
 * split is deliberate: the edges are the durable part worth querying,
 * while node state is the live progress of a workflow. ponytail: node
 * state is process-local — persist it only if a workflow must resume
 * across a restart.
 *
 * Traversal helpers live in ./graph.ts, edge persistence in ./store.ts,
 * and per-node state in ./nodes.ts; this file is the pass loop that
 * ties them together.
 */

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { DagGraph, } from "./graph";
import { NodeStates, } from "./nodes";
import { loadDependencies, saveDependency, } from "./store";
import type {
  DagRunResult,
  DagStatus,
  FailurePolicy,
  TaskNodeStatus,
  TaskRegistry,
  TaskRunContext,
} from "./types";

/**
 * Dependency-ordered workflow executor.
 *
 * Not a singleton: the composition root owns the instance and passes
 * it to `createWorkflowDagDispatch`. One engine holds one graph's state,
 * so concurrent workflows get one instance each.
 */
export class WorkflowDagEngine {
  readonly #db: Kysely<DB>;
  readonly #graph = new DagGraph();
  readonly #states = new NodeStates();
  /** Only `done` unblocks a dependent. A `failed` or `skipped`
   *  prerequisite does not, which is what keeps a `retry` dependent
   *  waiting for its prerequisite to actually succeed.
   */
  readonly #isDone = (taskId: string,): boolean => this.#states.get(taskId,)?.state === "done";

  constructor(db: Kysely<DB>,) {
    this.#db = db;
  }

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
   * @param taskId the blocked node
   * @param dependsOnTaskId the node it waits for
   * @param onFailure what to do with `taskId` when the prerequisite fails
   * @throws {Error} when the edge would close a cycle, or when the two
   *   ids are equal (the degenerate self-cycle)
   * @returns {Promise<void>}
   */
  async addDependency(
    taskId: string,
    dependsOnTaskId: string,
    onFailure: FailurePolicy = "skip",
  ): Promise<void> {
    if (taskId === dependsOnTaskId) {
      throw new Error(`task ${JSON.stringify(taskId)} cannot depend on itself`,);
    }
    if (this.#graph.wouldCycle(taskId, dependsOnTaskId,)) {
      throw new Error(
        `cycle rejected: ${JSON.stringify(taskId)} -> ${JSON.stringify(dependsOnTaskId)} — ` +
          `${JSON.stringify(dependsOnTaskId)} already depends on ` +
          `${JSON.stringify(taskId)} (directly or transitively)`,
      );
    }

    await saveDependency(this.#db, taskId, dependsOnTaskId, onFailure,);

    this.#graph.link(taskId, dependsOnTaskId, onFailure,);
    this.#states.touch(taskId,);
    this.#states.touch(dependsOnTaskId,);
  }

  /**
   * Load the persisted edges into this engine's graph.
   *
   * Node state is deliberately NOT restored — only the edges. A
   * restarted process has no memory of which nodes completed, so every
   * node comes back `blocked` and the pass re-derives progress. That is
   * the safe direction: work may run twice, never silently never.
   *
   * @returns {Promise<void>}
   */
  async hydrate(): Promise<void> {
    for (const edge of await loadDependencies(this.#db,)) {
      this.#graph.link(edge.taskId, edge.dependsOnTaskId, edge.onFailure,);
      this.#states.touch(edge.taskId,);
      this.#states.touch(edge.dependsOnTaskId,);
    }
  }

  /** Prerequisite ids for a node — its slice of the graph. */
  dependsOn(taskId: string,): string[] {
    return this.#graph.dependsOn(taskId,);
  }

  /**
   * One dispatch pass: run every node whose prerequisites are all
   * `done`, then settle the failure policies the pass produced.
   *
   * Sequential on purpose. Independent branches could overlap, but a
   * node must see its prerequisites already committed, and sequential
   * keeps the RNG draw order deterministic across a diamond.
   *
   * @param tasks task id → body. A node absent from the map has no
   *   body to run, so it is not dispatched and is reported in
   *   `blocked` rather than as a failure.
   * @param nowMs the tick instant handed to every task body
   * @param rng the scheduler's shared RNG
   * @returns what the pass ran, failed, skipped, and left blocked
   * @throws Nothing. A body that throws marks its node `failed` and the
   *   pass continues — one broken node cannot strand the rest.
   */
  async runPass(tasks: TaskRegistry, nowMs: number, rng: () => number,): Promise<DagRunResult> {
    const ran: string[] = [];
    const failed: string[] = [];
    const skipped: string[] = [];

    // A task body with no edges is a root node, and a root has to be
    // declared before the sweep sees it — otherwise a graph that is
    // nothing but independent tasks would dispatch nothing at all.
    for (const taskId of tasks.keys()) {
      this.#graph.declare(taskId,);
      this.#states.touch(taskId,);
    }

    for (const taskId of this.#graph.nodes()) {
      if (!this.#dispatchable(taskId, tasks)) { continue; }
      const ok = await this.#runNode(taskId, tasks, nowMs, rng);
      (ok ? ran : failed).push(taskId,);
      // A non-successful node is a non-success for its `skip`
      // dependents. A `retry` dependent is deliberately left alone so
      // it comes back when the prerequisite succeeds later.
      this.#cascadeSkip(taskId, skipped);
    }

    return { ran, failed, skipped, blocked: this.#blockedIds() };
  }

  /** Can this node be dispatched this pass? It must have a body, must
   *  not have settled already, and must have every prerequisite `done`.
   * @param taskId
   * @param tasks the bodies available this pass
   */
  #dispatchable(taskId: string, tasks: TaskRegistry,): boolean {
    return this.#states.dispatchable(
      taskId,
      tasks.has(taskId,),
      this.#graph.isUnblocked(taskId, this.#isDone,),
    );
  }

  /** Run one task body and record the outcome on its node. A body that
   *  throws is caught here, so one broken task cannot abort the pass or
   *  escape into the scheduler's other dispatch targets.
   * @param taskId
   * @param tasks the bodies available this pass
   * @param nowMs the tick instant handed to the body
   * @param rng the scheduler's shared RNG
   * @returns true when the body completed successfully
   */
  async #runNode(
    taskId: string,
    tasks: TaskRegistry,
    nowMs: number,
    rng: () => number,
  ): Promise<boolean> {
    const attempt = this.#states.begin(taskId,);
    if (attempt === null) { return false; }
    const ctx: TaskRunContext = { taskId, nowMs, rng, attempt, };
    try {
      await (tasks.get(taskId,))(ctx,);
      this.#states.succeed(taskId,);
      return true;
    } catch (error: unknown) {
      this.#states.fail(taskId, error instanceof Error ? error.message : String(error,),);
      return false;
    }
  }

  /**
   * The status surface: every known node with its state, error, and
   * attempt count. Roots and never-scheduled nodes both appear, so a
   * caller renders the whole graph in one read.
   * @returns {DagStatus}
   */
  statusMap(): DagStatus {
    const nodes: Record<string, TaskNodeStatus> = {};
    for (const taskId of this.#graph.nodes()) {
      nodes[taskId] = this.#states.statusFor(taskId,);
    }
    return { nodes };
  }

  /** Put a node back in play and clear its error, so failed work can be
   *  re-attempted. It goes to `ready` rather than straight to dispatch:
   *  a later pass picks it up once its prerequisites are `done`.
   * @param taskId
   * @returns {void}
   */
  reset(taskId: string,): void {
    this.#states.reset(taskId,);
  }

  // ── internals ──────────────────────────────────────────────

  /** Skip the `skip`-policy dependents of a non-successful node,
   *  transitively. A skipped node is itself a non-success, so its own
   *  `skip` dependents cascade too — otherwise D would sit `blocked`
   *  forever behind a C that can never run. `retry` dependents are
   *  never touched.
   * @param taskId the node that failed or was just skipped
   * @param skipped accumulator the pass reports
   */
  #cascadeSkip(taskId: string, skipped: string[]): void {
    // Only a NON-successful node strands its dependents. A `done` node
    // unblocks them instead, so cascading from it would skip every
    // child of a successful parent. The recursive call below re-enters
    // here with a freshly-skipped node, whose state is `skipped` — not
    // `done` — so the cascade still propagates transitively.
    if (this.#isDone(taskId)) { return; }

    const dependents = this.#graph.skipDependents(taskId, (dependent,) => {
      const state = this.#states.get(dependent,)?.state;
      return state === "done" || state === "skipped";
    },);
    for (const dependent of dependents) {
      if (this.#states.get(dependent,) === undefined) { continue; }
      this.#states.skip(dependent,);
      skipped.push(dependent,);
      this.#cascadeSkip(dependent, skipped);
    }
  }

  /** Nodes that cannot make progress: a prerequisite never reached
   *  `done`, or the node has no registered body to run.
   * @returns task ids, sorted
   */
  #blockedIds(): string[] {
    return this.#graph.nodes().filter((taskId,) => this.#states.get(taskId,)?.state === "blocked",);
  }
}
