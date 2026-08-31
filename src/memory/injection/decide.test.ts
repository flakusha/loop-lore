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
