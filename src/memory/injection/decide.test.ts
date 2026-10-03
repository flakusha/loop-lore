/**
 * Unit tests for `shouldInjectMemory` — verifies that pinned memories are
 * always injected (bypassing the probabilistic roll + cooldown), which is the
 * contract the memory-selection UI's pin control depends on.
 */
import { describe, expect, test, } from "bun:test";
import type { MemoryEntry, } from "../types";
import { shouldInjectMemory, } from "./decide";
import {
  DEFAULT_COMFORT,
  DEFAULT_INJECTION_CONFIG,
  type InjectionContext,
} from "./types";

/**
 * @param overrides
 */
function makeMemory(overrides: Partial<MemoryEntry>,): MemoryEntry {
  return {
    id: "mem-1",
    content: "remember this",
    memoryType: "episodic",
    confidence: 1,
    importance: 1,
    keywords: [],
    pinned: false,
    scope: "character",
    privacy: "shared",
    shareability: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

const ctx: InjectionContext = {
  chatId: "chat-1",
  worldId: null,
  locationId: null,
  isPrivateChat: true,
  participantCount: 2,
  turnNumber: 10,
  currentKeywords: [],
  averageIntimacy: 50,
  moodModifier: 0,
};

describe("shouldInjectMemory — pinned override", () => {
  test("pinned memory is always injected (even when random roll would fail)", () => {
    // randomFn=0.99 would normally fail the final roll (probability ~0.6).
    const memory = makeMemory({ pinned: true, },);
    const decision = shouldInjectMemory(
      memory,
      DEFAULT_INJECTION_CONFIG,
      { ...ctx, randomFn: () => 0.99, },
      DEFAULT_COMFORT,
      -1,
    );
    expect(decision.inject,).toBe(true,);
    expect(decision.reason,).toBe("pinned",);
    expect(decision.probability,).toBe(1,);
  });

  test("pinned memory injects regardless of cooldown", () => {
    // lastInjectedTurn within cooldown window — normally blocked, but pin wins.
    const memory = makeMemory({ pinned: true, },);
    const decision = shouldInjectMemory(
      memory,
      DEFAULT_INJECTION_CONFIG,
      { ...ctx, randomFn: () => 0, },
      DEFAULT_COMFORT,
      ctx.turnNumber, // just injected this turn
    );
    expect(decision.inject,).toBe(true,);
    expect(decision.reason,).toBe("pinned",);
  });

  test("non-pinned memory still follows the probabilistic roll", () => {
    const memory = makeMemory({ pinned: false, },);
    const failDecision = shouldInjectMemory(
      memory,
      DEFAULT_INJECTION_CONFIG,
      { ...ctx, randomFn: () => 0.99, },
      DEFAULT_COMFORT,
      -1,
    );
    expect(failDecision.inject,).toBe(false,);

    const passDecision = shouldInjectMemory(
      memory,
      DEFAULT_INJECTION_CONFIG,
      { ...ctx, randomFn: () => 0, },
      DEFAULT_COMFORT,
      -1,
    );
    expect(passDecision.inject,).toBe(true,);
  });
});

describe("shouldInjectMemory — semantic floor gate", () => {
  test("rejects when known score is below the floor", () => {
    const memory = makeMemory({},);
    const decision = shouldInjectMemory(
      memory,
      DEFAULT_INJECTION_CONFIG,
      { ...ctx, randomFn: () => 0.99, semanticScores: new Map([["mem-1", 0.1,],],), },
      DEFAULT_COMFORT,
      -1,
    );
    expect(decision.inject,).toBe(false,);
    expect(decision.reason,).toBe("semantic_floor",);
    expect(decision.probability,).toBeGreaterThan(0,);
  });

  test("does not gate when known score is at or above the floor", () => {
    const memory = makeMemory({},);
    const decision = shouldInjectMemory(
      memory,
      DEFAULT_INJECTION_CONFIG,
      { ...ctx, randomFn: () => 0, semanticScores: new Map([["mem-1", 0.9,],],), },
      DEFAULT_COMFORT,
      -1,
    );
    expect(decision.inject,).toBe(true,);
    expect(decision.reason,).not.toBe("semantic_floor",);
  });

  test("does not gate when the score is absent (fail-open)", () => {
    const memory = makeMemory({},);
    const decision = shouldInjectMemory(
      memory,
      DEFAULT_INJECTION_CONFIG,
      { ...ctx, randomFn: () => 0, semanticScores: new Map<string, number>(), },
      DEFAULT_COMFORT,
      -1,
    );
    expect(decision.inject,).toBe(true,);
    expect(decision.reason,).not.toBe("semantic_floor",);
  });

  test("config floor override is respected", () => {
    const memory = makeMemory({},);
    const strictConfig = { ...DEFAULT_INJECTION_CONFIG, semanticFloor: 0.5, };
    const scores = new Map([["mem-1", 0.3,],],);
    const rejected = shouldInjectMemory(
      memory,
      strictConfig,
      { ...ctx, randomFn: () => 0.99, semanticScores: scores, },
      DEFAULT_COMFORT,
      -1,
    );
    expect(rejected.reason,).toBe("semantic_floor",);

    const passed = shouldInjectMemory(
      memory,
      DEFAULT_INJECTION_CONFIG,
      { ...ctx, randomFn: () => 0, semanticScores: scores, },
      DEFAULT_COMFORT,
      -1,
    );
    expect(passed.reason,).not.toBe("semantic_floor",);
  });

  test("pinned memory bypasses the semantic floor gate", () => {
    const memory = makeMemory({ pinned: true, },);
    const decision = shouldInjectMemory(
      memory,
      DEFAULT_INJECTION_CONFIG,
      { ...ctx, randomFn: () => 0.99, semanticScores: new Map([["mem-1", 0.0,],],), },
      DEFAULT_COMFORT,
      -1,
    );
    expect(decision.inject,).toBe(true,);
    expect(decision.reason,).toBe("pinned",);
  });
});
