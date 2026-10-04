// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Task signals — explicit classification of an LLM request.
 *
 * Every dispatch call site declares what kind of work it is doing so the
 * router can pick a model without asking one. Classification is a pure
 * local function: routing an LLM call by first making an LLM call would
 * deadlock (and cost money on every turn).
 *
 * `TaskType` is closed: one member per dispatch surface — the two chat-facing
 * generation routes, the 11 AUX pipeline jobs (which reuse `AuxTaskName`
 * verbatim so a new AUX job is a compile error until it is classified), and
 * the background transports (embeddings, rerank).
 */
import type { AuxTaskName, } from "../../aux-pipeline/types";
import type { HarnessTaskType, } from "../../harness/types";

/** Closed set of classified work classes. */
export type TaskType = "interactive-turn" | "auto-gen" | AuxTaskName | "background";

/** Capability names a signal can require of a candidate model. */
export type TaskCapability = "text" | "image" | "embeddings" | "streaming" | "tools" | "thinking";

/** What the dispatcher knows about the request before it reaches a provider. */
export interface TaskSignal {
  taskType: TaskType;
  /** Prompt size in characters; compared against a candidate's `contextWindow`. */
  contextSize?: number;
  /** Rough token estimate for the whole exchange. */
  estimatedTokens?: number;
  /** Capabilities a candidate must have to be eligible. */
  requiresCapabilities?: TaskCapability[];
  /** Higher = more important; higher priority may be routed to a stronger model. */
  priority?: number;
  /** Wall-clock budget for the call. */
  budgetMs?: number;
  /** Token budget for the call. */
  budgetTokens?: number;
}

/** User-facing chat turn (generate route). Latency-sensitive. */
export const INTERACTIVE_TURN: TaskSignal = Object.freeze({ taskType: "interactive-turn", },);

/** Proactive / continuation generation (auto-gen). */
export const AUTO_GEN: TaskSignal = Object.freeze({ taskType: "auto-gen", },);

/** Off the chat hot path: embeddings + rerank. */
export const BACKGROUND: TaskSignal = Object.freeze({ taskType: "background", },);

/**
 * Map an AUX pipeline job to its signal. Each `AuxTaskName` doubles as a task
 * class, so the mapping is the identity — it exists to make the AUX
 * dispatch site state its class explicitly instead of sharing one blind
 * Auxiliary model.
 * @param task - AUX job name
 * @returns The signal for that job.
 */
export function toTaskSignal(task: AuxTaskName,): TaskSignal {
  return { taskType: task, };
}

/**
 * Map a routing task class onto the exec log's `HarnessTaskType` union.
 *
 * The two vocabularies are deliberately different: routing needs one class per
 * dispatch surface (so a new AUX job is classified individually), while the log
 * groups the AUX family into one rollup bucket. The final fall-through IS the
 * AUX family: `TaskType` is `interactive-turn | auto-gen | AuxTaskName |
 * background`, so once the three named members are excluded, TypeScript has
 * narrowed the rest to `AuxTaskName`. No hand-maintained name list to drift.
 * @param taskType - routing class
 * @returns The exec-log task type.
 */
export function toHarnessTaskType(taskType: TaskType,): HarnessTaskType {
  if (taskType === "interactive-turn") { return "chat"; }
  if (taskType === "auto-gen") { return "auto-gen"; }
  // embeddings + rerank both go through the shared background transport.
  if (taskType === "background") { return "memory"; }
  return "aux";
}
