// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Generation flow regulation: concurrency caps.
 *
 * Reject-fast (409), never queue — the UI renders a disabled state
 * instead of a spinner. Rechecked at the route gate
 * and at slot claim would race; the claim-time check in
 * `validateGenerateRequest` runs BEFORE `hasInFlightGeneration` so a
 * regulated request creates no attempt row and no in-memory entry.
 *
 * Per-user rate limiting lives in the shared v1 governance guard
 * (`generationPolicy`: 20/min + burst 5, per user) — a second limiter here
 * would double-consume budget on the same request, so this module gates
 * only what governance cannot see: live concurrency. Zero caps pass.
 *
 * Single-process in-memory state, same invariant as the auth limiters —
 * see routes/auth/shared.ts. Concurrency counts come from the existing
 * cancellation-tracker maps (no parallel bookkeeping to drift).
 */
import type { Config, } from "../config/schema";
import { activeGenerations, chatToAttempt, } from "./cancellation-tracker/state";

/** Resolved regulation policy for one gate evaluation. */
export interface FlowControlPolicy {
  maxConcurrentGlobal: number;
  maxConcurrentPerChat: number;
}

/** Defaults mirror GENERATION_FLOW_CONTROL_DEFAULTS (config may override). */
export const FLOW_CONTROL_DEFAULTS: FlowControlPolicy = {
  maxConcurrentGlobal: 0,
  maxConcurrentPerChat: 0,
};

/**
 * Resolve the active policy: config `generation.flowControl` over defaults.
 * Zero/negative reads as unbounded (matches the documented 0 = no limit).
 * @param config
 * @returns the effective policy
 */
export function resolveFlowPolicy(config?: Config,): FlowControlPolicy {
  const fc = config?.generation?.flowControl;
  return {
    maxConcurrentGlobal: fc?.maxConcurrentGlobal ?? FLOW_CONTROL_DEFAULTS.maxConcurrentGlobal,
    maxConcurrentPerChat: fc?.maxConcurrentPerChat ?? FLOW_CONTROL_DEFAULTS.maxConcurrentPerChat,
  };
}

/**
 * Concurrency gate off the live tracker maps. Zero/negative caps pass;
 * otherwise a full house refuses with the contended scope for the message.
 * @param chatId
 * @param policy
 * @returns null when a slot is free, else the contended scope
 */
export function gateConcurrency(chatId: string, policy: FlowControlPolicy,): "global" | "chat" | null {
  if (policy.maxConcurrentGlobal > 0 && activeGenerations.size >= policy.maxConcurrentGlobal) {
    return "global";
  }

  if (policy.maxConcurrentPerChat <= 0) { return null; }
  let inChat = 0;
  for (const attemptId of chatToAttempt.values()) {
    if (activeGenerations.has(attemptId,)) {
      const entry = activeGenerations.get(attemptId,);
      if (entry?.chatId === chatId) { inChat += 1; }
    }
  }

  return inChat >= policy.maxConcurrentPerChat ? "chat" : null;
}
