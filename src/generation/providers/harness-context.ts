// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Harness exec-log context carried on a generation request.
 *
 * Its own module rather than part of `types.ts`: the provider wire contract
 * and the harness logging contract are separate concerns, and keeping them
 * apart stops the exec-log vocabulary from growing the file the size gate
 * polices.
 */
// Type-only, so it is erased at compile time: `routing/task-signal` imports
// the harness log types back, and neither module loads the other at runtime.
import type { TaskType, } from "../routing/task-signal";

/**
 * Exec-log context for one egress call.
 *
 * Carried alongside the request (not inside it on the wire) so the routing
 * signal can reach the exec-log writer without becoming a field of the
 * provider HTTP body: every `buildBody` constructs its payload from explicit
 * fields, so nothing here is ever serialized to a provider.
 *
 * Every field is optional: a caller that does not care about exec logging
 * passes nothing and gets the pre-harness behavior unchanged.
 */
export interface HarnessCallContext {
  /**
   * Routing class of this call. Typed as the routing `TaskType` so a dispatch
   * site states its class explicitly; the exec log maps it to its own rollup
   * buckets via `toHarnessTaskType`. Undefined logs as "other".
   */
  taskType?: TaskType;
  /** Human label for the call site (e.g. "generate-route", "aux:intent"). */
  task?: string;
  /** Pattern that produced the call; free-form, defaults to "none". */
  pattern?: string;
  /** Free-form pattern detail. */
  patternDetail?: string;
  /**
   * Correlation id of the user turn this call belongs to. Every tool round of
   * one turn carries the same value, so the several exec-log lines one turn
   * wrote are one node. Omitted when the dispatch site has no turn in scope.
   */
  turnId?: string;
}

/** What {@link harnessContext} accepts — an options object, so adding a field
 * is additive rather than another positional argument every call site must
 * learn. */
export interface HarnessContextOptions {
  /** Routing class of the call. */
  taskType: TaskType;
  /** Human label for the call site (e.g. "generate-route"). */
  task: string;
  /** Turn correlation id; omitted when the path has no turn in scope. */
  turnId?: string;
}

/**
 * Build the exec-log context for a dispatch site. A helper rather than an
 * inline literal so every call site names its task the same way and the
 * signal type is threaded from one import.
 * @param opts - the routing class, the human label, and the turn correlation
 *   id when the call site has one in scope
 * @returns a context object ready to spread onto the request.
 */
export function harnessContext(opts: HarnessContextOptions,): HarnessCallContext {
  return { taskType: opts.taskType, task: opts.task, turnId: opts.turnId, };
}
