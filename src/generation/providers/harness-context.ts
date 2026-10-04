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
}

/**
 * Build the exec-log context for a dispatch site. A helper rather than an
 * inline literal so every call site names its task the same way and the
 * signal type is threaded from one import.
 * @param taskType - the routing class of the call
 * @param task - human label for the call site (e.g. "generate-route")
 * @returns a context object ready to spread onto the request.
 */
export function harnessContext(taskType: TaskType, task: string,): HarnessCallContext {
  return { taskType, task, };
}
