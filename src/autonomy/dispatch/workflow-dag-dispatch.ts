// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/autonomy/dispatch/workflow-dag-dispatch.ts — DAG dispatch target
 *
 * Adapts `WorkflowDagEngine` (src/cron/dag) to the `AutonomyDispatch`
 * seam, so the workflow DAG is driven by the SAME world tick that
 * drives NPC movement rather than by a second timer.
 *
 * ## Does it spend the autonomy budget?
 *
 * No — and that is the deliberate choice, not an oversight. The
 * governor's contract is "one consume per autonomous action". A DAG
 * target is not one action: it invokes a caller-supplied set of task
 * bodies, of which any number may be skipped, and the set is chosen by
 * the graph, not by the tick. Charging `per_tick_action` once for the
 * pass would under-charge a pass that ran 12 tasks, and charging per
 * task would make the DAG's own budget spend depend on a task list
 * this module does not own.
 *
 * The budget belongs to whoever defines the task bodies: a body that
 * calls an LLM should charge `per_minute_generation` itself, exactly
 * as the tick-driver charges `per_tick_action` for the movement work
 * it performs. This target is the scheduler's bus, not a paid actor.
 * ponytail: no governor call here — add a per-task consume if task
 * bodies turn out to be uniformly expensive and unaccounted for.
 */

import type { AutonomyDispatch, AutonomyDispatchContext, AutonomyDispatchResult, } from "../scheduler/types";
import type { TaskRegistry, } from "../../cron/dag/types";
import { WorkflowDagEngine, } from "../../cron/dag/engine";

/** Stable target name, used in telemetry and outcome strings. */
const DISPATCH_NAME = "workflow_dag";

/** Options for {@link createWorkflowDagDispatch}. */
export interface WorkflowDagDispatchOptions {
  /** Task bodies this dispatch runs. Supplied per-pass by `tasks`, or
   *  fixed for the engine's lifetime when omitted.
    tasks?: TaskRegistry;
  /** Pre-built engine. Omitted → one is created lazily from the first
   *  tick's `ctx.db` and reused, so node state survives across ticks.
   */
  engine?: WorkflowDagEngine;
}

/** The dispatch, plus the engine behind it, so a caller can register
 *  dependencies and read the status surface without a second lookup.
 */
export interface WorkflowDagDispatchHandle {
  dispatch: AutonomyDispatch;
  /** Per-node state for the status surface. */
  engine: WorkflowDagEngine;
}

/**
 * Build the `workflow_dag` dispatch target.
 *
 * The engine is created lazily on first tick because the factory has no
 * database handle of its own — `AutonomyDispatchContext` supplies one.
 * Callers that want to add dependencies before the first tick pass
 * their own `engine`.
 *
 * @param opts task bodies and/or a pre-built engine
 * @returns the dispatch plus its engine handle
 * @throws {Error} never directly; a task body that throws is caught by
 *   the engine and recorded as a `failed` node, so one broken task
 *   cannot abort the world tick
 */
export function createWorkflowDagDispatch(
  opts: WorkflowDagDispatchOptions = {},
): WorkflowDagDispatchHandle {
  let engine = opts.engine;

  const dispatch: AutonomyDispatch = {
    name: DISPATCH_NAME,
    /**
     * @param ctx
     * @returns {Promise<AutonomyDispatchResult>}
     */
    run: async (ctx: AutonomyDispatchContext,): Promise<AutonomyDispatchResult> => {
      const tasks = opts.tasks;
      if (tasks === undefined || tasks.size === 0) { return { skipped: "no_tasks", }; }
      engine ??= new WorkflowDagEngine(ctx.db,);

      const result = await engine.runPass(tasks, ctx.nowMs, ctx.rng,);
      // `ran` is the honest work count: skipped and still-blocked nodes
      // cost nothing, so folding them in would overstate the tick.
      return { dispatched: result.ran.length, };
    },
  };

  return {
    dispatch,
    /** The engine, once a tick has created it. Throws before then when
     *  no `engine` option was supplied — read the status only after the
     *  first tick, or pass your own engine.
     *  @throws {Error} when called before the first tick created it
     */
    get engine(): WorkflowDagEngine {
      if (engine === undefined) {
        throw new Error(
          "workflow_dag engine not created yet — pass `engine` to read status before the first tick",
        );
      }
      return engine;
    },
  };
}
