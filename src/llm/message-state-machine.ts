// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/llm/message-state-machine.ts — LLM request lifecycle states.
//
// Distinct from the message *delivery* state machine in
// `src/db/enums-core/flags.ts` (MessageSeenState / MessageStatus). That
// tracks what the chat layer knows about a message row; this tracks the
// LLM-side request lifecycle: from queued → generating → paused/terminal.
//
// Transitions:
//   pending    → queued | scheduled | cancelled
//   queued     → generating | cancelled
//   scheduled  → queued | cancelled
//   generating → paused | complete | failed | cancelled
//   paused     → queued | cancelled
//   complete   → (terminal)
//   failed     → (terminal)
//   cancelled  → (terminal)

import { createMachine, type StateDef, type StateMachine, } from "../db/state";

/** LLM request lifecycle states. */
export const LlmRequestState = {
  Pending: "pending",
  Queued: "queued",
  Scheduled: "scheduled",
  Generating: "generating",
  Paused: "paused",
  Complete: "complete",
  Failed: "failed",
  Cancelled: "cancelled",
} as const;
/** */
export type LlmRequestState = (typeof LlmRequestState)[keyof typeof LlmRequestState];

const def: StateDef<LlmRequestState> = {
  values: [
    LlmRequestState.Pending,
    LlmRequestState.Queued,
    LlmRequestState.Scheduled,
    LlmRequestState.Generating,
    LlmRequestState.Paused,
    LlmRequestState.Complete,
    LlmRequestState.Failed,
    LlmRequestState.Cancelled,
  ],
  initial: LlmRequestState.Pending,
  terminal: [
    LlmRequestState.Complete,
    LlmRequestState.Failed,
    LlmRequestState.Cancelled,
  ],
  transitions: {
    [LlmRequestState.Pending]: [
      LlmRequestState.Queued,
      LlmRequestState.Scheduled,
      LlmRequestState.Cancelled,
    ],
    [LlmRequestState.Queued]: [
      LlmRequestState.Generating,
      LlmRequestState.Cancelled,
    ],
    [LlmRequestState.Scheduled]: [
      LlmRequestState.Queued,
      LlmRequestState.Cancelled,
    ],
    [LlmRequestState.Generating]: [
      LlmRequestState.Paused,
      LlmRequestState.Complete,
      LlmRequestState.Failed,
      LlmRequestState.Cancelled,
    ],
    [LlmRequestState.Paused]: [
      LlmRequestState.Queued,
      LlmRequestState.Cancelled,
    ],
    [LlmRequestState.Complete]: [],
    [LlmRequestState.Failed]: [],
    [LlmRequestState.Cancelled]: [],
  },
};

/** State machine instance for LLM request lifecycle. */
export const llmRequestStateMachine: StateMachine<LlmRequestState> = createMachine(def,);
