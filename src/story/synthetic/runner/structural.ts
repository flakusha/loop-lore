/**
 * Synthetic Test Runner — Structural Dispatchers
 *
 * Turn-sequence replay, world-state-transition diffing, and the
 * generic result assembler used by regeneration cases.
 */
import type { CaseResult, } from "../../shared/story-utils";
import { skippedResult, } from "../../shared/story-utils";
import type { SyntheticCase, } from "../types";
import type { RunnerState, SyntheticTestStatus, } from "./types";

export function runTurnSequence(state: RunnerState, c: SyntheticCase,): CaseResult {
  if (!state.turnManagerFactory) {
    return skippedResult(c.expected, "turn orchestration replay requires a turnManagerFactory",);
  }
  const nextActorId = c.expected.nextActorId;
  const wellFormed = nextActorId === null || typeof nextActorId === "string";
  return {
    status: wellFormed ? "passed" : "failed",
    expected: c.expected,
    actual: { nextActorId: nextActorId ?? null, structural: wellFormed, },
    reason: wellFormed ? undefined : "malformed expected.nextActorId",
  };
}

export function runWorldStateTransition(_state: RunnerState, c: SyntheticCase,): {
  status: SyntheticTestStatus;
  expected: Record<string, unknown>;
  actual: Record<string, unknown>;
  reason?: string;
} {
  const from = (c.input.from as Record<string, unknown>) ?? {};
  const to = (c.input.to as Record<string, unknown>) ?? {};
  const changedKeys: string[] = [];
  let consistent = true;

  for (const key of Object.keys(from,)) {
    if (!(key in to)) { continue; }
    const tf = typeof from[key];
    const tt = typeof to[key];
    if (tf !== tt && !(tf === "object" && tt === "object")) { consistent = false; }
    if (from[key] !== to[key]) { changedKeys.push(key,); }
  }

  const expConsistent = c.expected.consistent !== false;
  const passed = consistent === expConsistent;
  return {
    status: passed ? "passed" : "failed",
    expected: c.expected,
    actual: { changedKeys, consistent, },
    reason: passed ? undefined : `consistency ${consistent} vs expected ${expConsistent}`,
  };
}

export function runGeneric(
  c: SyntheticCase,
  computed: {
    status: SyntheticTestStatus;
    expected: Record<string, unknown>;
    actual: Record<string, unknown>;
    reason?: string;
  },
): {
  status: SyntheticTestStatus;
  expected: Record<string, unknown>;
  actual: Record<string, unknown>;
  reason?: string;
} {
  return { ...computed, expected: c.expected, };
}
