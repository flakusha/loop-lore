// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/llm/index.ts — barrel exports for the LLM request scheduling slice.

// ponytail: surfaces only the public surface; helpers stay internal.

export { type Comparator, PriorityQueue, type PriorityQueueOptions, } from "./priority-queue";

export {
  ConcurrencyLimiter,
  createLimiterRegistry,
  type LimiterRegistry,
  type SemaphoreOptions,
} from "./concurrency-limiter";

export {
  LlmRequestState,
  type LlmRequestState as LlmRequestStateT,
  llmRequestStateMachine,
} from "./message-state-machine";

export {
  type Priority,
  PriorityLevel,
  type PriorityLevel as PriorityLevelT,
  ResourceManager,
  type ResourceManagerOptions,
  type ScheduledRequest,
  type ScheduleHandle,
  type ScheduleState,
} from "./resource-manager";
