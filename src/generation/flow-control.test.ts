// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Regression: generation flow regulation (concurrency caps).
 *
 * `gateConcurrency`: zero caps pass; a full global house refuses; a full
 * chat house refuses while other chats pass. Counts come from the live
 * tracker maps — ids are process-scoped and maps cleared per test, since
 * sibling suites (cancel, status, streaming) write the same module maps
 * and fixed ids flake under parallel bun test.
 * `resolveFlowPolicy`: config overrides defaults per-field.
 *
 * Rate limiting is NOT tested here: per-user budgets live in the shared
 * v1 governance guard (`generationPolicy`), not this module.
 */
import { afterEach, describe, expect, test, } from "bun:test";
import { GENERATION_FLOW_CONTROL_DEFAULTS, } from "../config/sections/generation/defaults";
import { activeGenerations, chatToAttempt, } from "./cancellation-tracker/state";
import {
  FLOW_CONTROL_DEFAULTS,
  type FlowControlPolicy,
  gateConcurrency,
  resolveFlowPolicy,
} from "./flow-control";

const POLICY: FlowControlPolicy = {
  maxConcurrentGlobal: 1,
  maxConcurrentPerChat: 1,
};

/**
 * File-scoped seed ids — other suites (cancel, status, streaming) write the
 * same module maps, so fixed ids leak across files under parallel bun test
 * and flake the empty/all-pass assertions. Fresh ids per process keep the
 * "tracked" assertions file-local; every test starts from cleared maps.
 */
const SEED_CHAT = `flow-test-${process.pid}-a`;
const SEED_ATTEMPT = `flow-test-${process.pid}-att-1`;

afterEach(() => {
  activeGenerations.clear();
  chatToAttempt.clear();
},);

/** Minimal ActiveGeneration entry carrying the fields the gates read. */
function seedActive(chatId: string, attemptId: string,): void {
  activeGenerations.set(attemptId, { chatId, attemptId, } as never,);
  chatToAttempt.set(chatId, attemptId,);
}

describe("gateConcurrency", () => {
  test("passes when nothing is tracked", () => {
    activeGenerations.clear();
    chatToAttempt.clear();
    expect(gateConcurrency(`flow-empty-${process.pid}`, POLICY,),).toBeNull();
  });

  test("zero caps pass regardless of tracked load", () => {
    seedActive(SEED_CHAT, SEED_ATTEMPT,);
    const open: FlowControlPolicy = { ...POLICY, maxConcurrentGlobal: 0, maxConcurrentPerChat: 0, };
    expect(gateConcurrency(SEED_CHAT, open,),).toBeNull();
  });

  test("a full global house refuses every chat", () => {
    seedActive(SEED_CHAT, SEED_ATTEMPT,);
    expect(gateConcurrency(SEED_CHAT, POLICY,),).toBe("global",);
    expect(gateConcurrency(`flow-other-${process.pid}`, POLICY,),).toBe("global",);
  });

  test("a full chat house refuses that chat but not others", () => {
    seedActive(SEED_CHAT, SEED_ATTEMPT,);
    const perChat: FlowControlPolicy = { ...POLICY, maxConcurrentGlobal: 0, };
    expect(gateConcurrency(SEED_CHAT, perChat,),).toBe("chat",);
    expect(gateConcurrency(`flow-other-${process.pid}`, perChat,),).toBeNull();
  });
});

describe("resolveFlowPolicy", () => {
  test("config overrides defaults per-field", () => {
    const policy = resolveFlowPolicy({
      generation: { flowControl: { maxConcurrentGlobal: 5, }, },
    } as never,);

    expect(policy.maxConcurrentGlobal,).toBe(5,);
    expect(policy.maxConcurrentPerChat,).toBe(FLOW_CONTROL_DEFAULTS.maxConcurrentPerChat,);
  });

  test("missing config reads defaults", () => {
    expect(resolveFlowPolicy(undefined,),).toEqual(FLOW_CONTROL_DEFAULTS,);
  });

  test("runtime defaults match config defaults", () => {
    expect(FLOW_CONTROL_DEFAULTS,).toEqual(GENERATION_FLOW_CONTROL_DEFAULTS,);
  });
});
