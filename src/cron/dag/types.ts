// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/cron/dag/types.ts — Workflow DAG shapes
 *
 * Pure shapes — no DB / logger / cron imports, so the planner and the
 * engine tests never pull in the registry. The engine runtime lives in
 * ./engine.ts.
 */

/** What to do with a dependent whose prerequisite did not finish
 *  successfully.
 *
 *  - `skip`  — the dependent is abandoned (`skipped`) and the policy
 *              propagates to ITS `skip` dependents, transitively.
 *  - `retry` — the dependent stays eligible; it is not skipped, so a
 *              later pass runs it once the prerequisite succeeds.
 */
export type FailurePolicy = "skip" | "retry";

/** Per-node execution state.
 *
 *  - `blocked` — at least one prerequisite is not `done`.
 *  - `ready`   — every prerequisite is `done`; awaiting dispatch.
 *  - `running` — dispatched, outcome not yet recorded.
 *  - `done`    — completed successfully. Unblocks its dependents.
 *  - `failed`  — the run threw. Unblocks dependents per `on_failure`.
 *  - `skipped` — abandoned because a prerequisite failed under a
 *                `skip` edge. Terminal.
 */
export type TaskNodeState = "blocked" | "ready" | "running" | "done" | "failed" | "skipped";

/** One task's state plus the error that put it there, for the status
 *  surface. `lastError` is null for every state except `failed`.
 */
export interface TaskNodeStatus {
  taskId: string;
  state: TaskNodeState;
  /** Set when `state === "failed"`; null otherwise. */
  lastError: string | null;
  /** Attempts made. `>= 1` once the node has run at least once. */
  attempts: number;
}

/** Everything the engine knows about one task graph. Returned by
 *  `statusMap()` so a caller renders the whole graph in one read.
 */
export interface DagStatus {
  /** task id → state. Every known node appears, including roots. */
  nodes: Record<string, TaskNodeStatus>;
}

/** Result of one `runPass()`. `ran` is the work the autonomy budget
 *  should see: a `skipped` node costs nothing because no body ran.
 */
export interface DagRunResult {
  /** Task ids dispatched this pass, in dispatch order. */
  ran: string[];
  /** Task ids that moved to `failed` this pass. */
  failed: string[];
  /** Task ids moved to `skipped` this pass (transitive cascade included). */
  skipped: string[];
  /** Nodes still `blocked` when the pass ran out of eligible work. */
  blocked: string[];
}

/** The unit of work the engine schedules. Throwing marks the node
 *  `failed` — the engine never lets one node's exception escape.
 *  @throws Whatever the task body throws. Caught by the engine and
 *   recorded as `failed`.
 */
export type TaskRunner = (ctx: TaskRunContext,) => Promise<void>;

/** Handed to every task body. Kept minimal on purpose: the engine
 *  knows about edges and states, not about what a task actually does.
 */
export interface TaskRunContext {
  /** This node's id. */
  taskId: string;
  /** The tick instant driving this pass. */
  nowMs: number;
  /** The shared RNG, for callers that need deterministic choices. */
  rng: () => number;
  /** Retries already made for this node. 0 on the first attempt. */
  attempt: number;
}

/** Task id → its body. A node with no entry never runs and stays
 *  `ready`; the engine reports it rather than failing the pass.
 */
export type TaskRegistry = ReadonlyMap<string, TaskRunner>;
