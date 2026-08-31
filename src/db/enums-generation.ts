// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * DB Schema Enums — Generation
 *
 * Generation attempt status, cancellation reasons and sources,
 * and streaming chunk actions.
 */

import { createMachine, type StateDef, } from "./state";

// ── Generation Attempts ───────────────────────────────────
export const GenerationStatus = {
  Pending: "pending",
  Processing: "processing",
  Streaming: "streaming",
  Completed: "completed",
  Failed: "failed",
  Cancelled: "cancelled",
} as const;
/** */
export type GenerationStatus = (typeof GenerationStatus)[keyof typeof GenerationStatus];

// ── State Machine ──────────────────────────────────────────

const generationStatusDef: StateDef<GenerationStatus> = {
  values: ["pending", "processing", "streaming", "completed", "failed", "cancelled",] as const,
  initial: "pending",
  transitions: {
    pending: ["processing",],
    processing: ["streaming", "completed", "failed", "cancelled",],
    streaming: ["completed", "failed", "cancelled",],
    completed: [],
    failed: [],
    cancelled: [],
  },
  terminal: ["completed", "failed", "cancelled",],
};

export const generationStatusMachine = createMachine(generationStatusDef,);

export const CancelReason = {
  UserCancel: "user_cancel",
  RepetitionDetected: "repetition_detected",
  PolicyMismatch: "policy_mismatch",
  ResponseLimit: "response_limit",
  ChatSwitch: "chat_switch",
  Timeout: "timeout",
  Error: "error",
} as const;
/** */
export type CancelReason = (typeof CancelReason)[keyof typeof CancelReason];

export const CancelSource = {
  User: "user",
  AutoRepetition: "auto_repetition",
  AutoPolicy: "auto_policy",
  AutoLimit: "auto_limit",
  ChatSwitch: "chat_switch",
  System: "system",
} as const;
/** */
export type CancelSource = (typeof CancelSource)[keyof typeof CancelSource];

// ── Streaming Chunk Pipeline ──────────────────────────────
export const ChunkAction = {
  Continue: "continue",
  CancelRepetition: "cancel_repetition",
  CancelPolicy: "cancel_policy",
  CancelResponseLimit: "cancel_response_limit",
  Complete: "complete",
} as const;
/** */
export type ChunkAction = (typeof ChunkAction)[keyof typeof ChunkAction];
