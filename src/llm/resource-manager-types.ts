// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/llm/resource-manager-types.ts — interfaces & types for the per-provider
// scheduler. Kept in its own file so `resource-manager.ts` stays under the
// 250-line ceiling enforced by the size-strict CI gate.

import type { InternalHandle, } from "./internal-handle";

/** Numeric priority (lower = more urgent). */
export type Priority = number;

/** Built-in priority buckets. */
export const PriorityLevel = {
  High: 0,
  Normal: 100,
  Low: 200,
} as const;
/** */
export type PriorityLevel = (typeof PriorityLevel)[keyof typeof PriorityLevel];

/** */
export interface ScheduledRequest<T,> {
  readonly id: string;
  readonly provider: string;
  /** Lower = more urgent. */
  readonly priority: Priority;
  /** The work to perform once a slot is acquired. */
  readonly run: () => Promise<T>;
}

/** */
export interface ScheduleHandle<T,> {
  /** Caller-defined id. */
  readonly id: string;
  readonly result: Promise<T>;
  /**
   * Cancel a pending or in-flight request. If still queued, removes it
   * from the queue; if running, rejects so the awaiter unwinds.
   */
  cancel(reason?: string,): void;
  readonly state: ScheduleState;
}

/** */
export type ScheduleState = "queued" | "running" | "complete" | "cancelled";

/** */
export interface ResourceManagerOptions {
  /** Per-provider slot caps. Falls back to `defaultMax` when unlisted. */
  providerMax?: Record<string, number>;
  /** Fallback slot cap for providers without an entry in `providerMax`. */
  defaultMax?: number;
}

/** */
export interface QueueEntry {
  key: number;
  handle: InternalHandle<unknown>;
}
