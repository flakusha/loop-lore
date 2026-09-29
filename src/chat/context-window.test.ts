// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, it, } from "bun:test";
import { computeContextWindow, getThresholdState, injectEvents, injectMemories, } from "./context-window";
import type { ContextWindow, EventRef, MemoryRef, MessageRef, } from "./types/context";

/**
 * Build a chronologically-ordered MessageRef.
 * @param id - Unique message id
 * @param content - Message text (tokenCount defaults to ceil(content.length/4))
 * @param index - Zero-based index; createdAt derives from index
 * @param overrides - Optional field overrides (role, tokenCount)
 * @param overrides.role
 * @param overrides.tokenCount
 */
function makeMsg(
  id: string,
  content: string,
  index: number,
  overrides?: { role?: MessageRef["role"]; tokenCount?: number },
): MessageRef {
  return {
    messageId: id,
    role: overrides?.role ?? "user",
    content,
    tokenCount: overrides?.tokenCount ?? Math.ceil(content.length / 4,),
    createdAt: new Date(2026, 0, 1, 0, index,).toISOString(),
  };
}

describe("computeContextWindow — phase 3 overflow trim", () => {
  it("drops oldest messages when recent alone exceed the budget", () => {
    // Five messages with tokenCount 100 each; budget 250 forces phase 3 to trim.
    const messages: MessageRef[] = [
      makeMsg("m1", "oldest-1", 0, { tokenCount: 100, },),
      makeMsg("m2", "oldest-2", 1, { tokenCount: 100, },),
      makeMsg("m3", "middle", 2, { tokenCount: 100, },),
      makeMsg("m4", "newer", 3, { tokenCount: 100, },),
      makeMsg("m5", "newest", 4, { tokenCount: 100, },),
    ];

    const result = computeContextWindow(messages, 250,);

    // The newest two (m4 + m5 = 200 tokens) must survive; m3 would push us to 300.
    const retainedIds = result.retained.map((m,) => m.messageId);
    expect(retainedIds,).toContain("m5",);
    expect(retainedIds,).toContain("m4",);
    expect(retainedIds,).not.toContain("m1",);
    expect(retainedIds,).not.toContain("m2",);
    expect(result.totalTokens,).toBeLessThanOrEqual(250,);
  });

  it("always retains the newest message on overflow", () => {
    const messages: MessageRef[] = [
      makeMsg("a", "alpha", 0, { tokenCount: 200, },),
      makeMsg("b", "bravo", 1, { tokenCount: 200, },),
      makeMsg("c", "charlie", 2, { tokenCount: 200, },),
    ];

    // Budget 250 fits only the newest message (200 ≤ 250, then 200 + 200 = 400 > 250).
    const result = computeContextWindow(messages, 250,);

    expect(result.retained.length,).toBe(1,);
    expect(result.retained[0]!.messageId,).toBe("c",);
    expect(result.totalTokens,).toBeLessThanOrEqual(250,);
  });

  it("preserves chronological order of surviving messages", () => {
    const messages: MessageRef[] = [
      makeMsg("m1", "one", 0, { tokenCount: 100, },),
      makeMsg("m2", "two", 1, { tokenCount: 100, },),
      makeMsg("m3", "three", 2, { tokenCount: 100, },),
      makeMsg("m4", "four", 3, { tokenCount: 100, },),
    ];

    const result = computeContextWindow(messages, 250,);

    // Surviving messages are the newest two; they must appear in order.
    expect(result.retained.map((m,) => m.messageId),).toEqual(["m3", "m4",],);
  });

  it("retains the original MessageRef references (no cloning in phase 3)", () => {
    const m1 = makeMsg("m1", "one", 0, { tokenCount: 100, },);
    const m2 = makeMsg("m2", "two", 1, { tokenCount: 100, },);
    const m3 = makeMsg("m3", "three", 2, { tokenCount: 100, },);

    const result = computeContextWindow([m1, m2, m3,], 250,);

    // Phase 3 trims oldest first; with budget 250 the newest two (m3 + m2 = 200) fit.
    // Pruning pipeline relies on identity to re-use retained entries.
    expect(result.retained,).toContain(m3,);
    expect(result.retained,).toContain(m2,);
    expect(result.retained,).not.toContain(m1,);
  });

  it("does not invoke phase 3 when phase 2 already fits the budget", () => {
    // All messages fit comfortably — totalTokens stays under maxTokens.
    const messages: MessageRef[] = [
      makeMsg("m1", "one", 0, { tokenCount: 10, },),
      makeMsg("m2", "two", 1, { tokenCount: 10, },),
      makeMsg("m3", "three", 2, { tokenCount: 10, },),
    ];

    const result = computeContextWindow(messages, 1000,);

    expect(result.totalTokens,).toBe(30,);
    expect(result.retained.length,).toBe(3,);
    // All three retained in order.
    expect(result.retained.map((m,) => m.messageId),).toEqual(["m1", "m2", "m3",],);
  });
});

describe("computeContextWindow — input edges and option pass-through", () => {
  it("handles an empty message list", () => {
    const result = computeContextWindow([], 1000,);

    expect(result.retained,).toEqual([],);
    expect(result.totalTokens,).toBe(0,);
    expect(result.usagePercentage,).toBe(0,);
    expect(result.willTrim,).toBe(false,);
    expect(result.mode,).toBe("direct",);
    expect(result.activeParticipants,).toEqual([],);
    expect(result.currentTurnActorId,).toBeNull();
  });

  it("keeps all messages when minRecent exceeds the message count", () => {
    const messages: MessageRef[] = [
      makeMsg("a", "alpha", 0,),
      makeMsg("b", "bravo", 1,),
    ];

    const result = computeContextWindow(messages, 1000, { minRecent: 8, },);

    expect(result.retained.map((m,) => m.messageId,),).toEqual(["a", "b",],);
  });

  it("minRecent: 0 routes every message through the phase 2 budget fill", () => {
    const messages: MessageRef[] = [
      makeMsg("a", "alpha", 0, { tokenCount: 10, },),
      makeMsg("b", "bravo", 1, { tokenCount: 10, },),
      makeMsg("c", "charlie", 2, { tokenCount: 10, },),
    ];

    const result = computeContextWindow(messages, 15, { minRecent: 0, },);

    // Only the newest message fits the 15-token budget.
    expect(result.retained.map((m,) => m.messageId,),).toEqual(["c",],);
    expect(result.totalTokens,).toBe(10,);
  });

  it("falls back to estimateTokens when tokenCount is 0", () => {
    const messages: MessageRef[] = [
      makeMsg("a", "abcd", 0, { tokenCount: 0, },),
    ];

    const result = computeContextWindow(messages, 1000,);

    // estimateTokens("abcd") = ceil(4 / 4) = 1 — not 0.
    expect(result.totalTokens,).toBe(1,);
  });

  it("reports usagePercentage 0 when maxTokens is 0", () => {
    const messages: MessageRef[] = [
      makeMsg("a", "", 0, { tokenCount: 0, },),
    ];

    const result = computeContextWindow(messages, 0,);

    expect(result.retained.map((m,) => m.messageId,),).toEqual(["a",],);
    expect(result.totalTokens,).toBe(0,);
    expect(result.usagePercentage,).toBe(0,);
    expect(result.willTrim,).toBe(false,);
  });

  it("sets willTrim at the imminent threshold", () => {
    const messages: MessageRef[] = [
      makeMsg("a", "x".repeat(380,), 0, { tokenCount: 95, },),
    ];

    const result = computeContextWindow(messages, 100,);

    expect(result.usagePercentage,).toBe(95,);
    expect(result.willTrim,).toBe(true,);
  });

  it("honors custom thresholds for willTrim", () => {
    const messages: MessageRef[] = [
      makeMsg("a", "x", 0, { tokenCount: 30, },),
    ];

    const result = computeContextWindow(messages, 100, {
      thresholds: { warning: 10, critical: 20, imminent: 30, },
    },);

    expect(result.willTrim,).toBe(true,);
  });

  it("passes mode, activeParticipants, and currentTurnActorId through", () => {
    const result = computeContextWindow([], 1000, {
      mode: "group",
      activeParticipants: ["p1",],
      currentTurnActorId: "p2",
    },);

    expect(result.mode,).toBe("group",);
    expect(result.activeParticipants,).toEqual(["p1",],);
    expect(result.currentTurnActorId,).toBe("p2",);
    expect(result.features.turnOrchestration,).toBe(true,);
  });
});

describe("computeContextWindow — phase 2 budget fill", () => {
  it("adds older messages newest-to-oldest until the budget is exhausted", () => {
    const messages: MessageRef[] = [
      makeMsg("m1", "one", 0, { tokenCount: 10, },),
      makeMsg("m2", "two", 1, { tokenCount: 10, },),
      makeMsg("m3", "three", 2, { tokenCount: 10, },),
      makeMsg("m4", "four", 3, { tokenCount: 10, },),
      makeMsg("m5", "five", 4, { tokenCount: 10, },),
    ];

    // minRecent 2 → m4+m5 guaranteed (20 tokens). Budget 35 fits m3 (30)
    // but not m2 (40).
    const result = computeContextWindow(messages, 35, { minRecent: 2, },);

    expect(result.retained.map((m,) => m.messageId,),).toEqual(["m3", "m4", "m5",],);
    expect(result.totalTokens,).toBe(30,);
    expect(result.usagePercentage,).toBe(86,);
  });
});

describe("computeContextWindow — phase 3 full trim", () => {
  it("empties retained when even the newest message exceeds the budget", () => {
    const messages: MessageRef[] = [
      makeMsg("a", "alpha", 0, { tokenCount: 200, },),
    ];

    const result = computeContextWindow(messages, 100,);

    expect(result.retained,).toEqual([],);
    expect(result.totalTokens,).toBe(0,);
    expect(result.usagePercentage,).toBe(0,);
  });
});

describe("getThresholdState", () => {
  it("classifies usage with default thresholds", () => {
    expect(getThresholdState(0,),).toBe("healthy",);
    expect(getThresholdState(59,),).toBe("healthy",);
    expect(getThresholdState(60,),).toBe("warning",);
    expect(getThresholdState(79,),).toBe("warning",);
    expect(getThresholdState(80,),).toBe("critical",);
    expect(getThresholdState(94,),).toBe("critical",);
    expect(getThresholdState(95,),).toBe("imminent",);
    expect(getThresholdState(100,),).toBe("imminent",);
    expect(getThresholdState(150,),).toBe("imminent",);
  });

  it("classifies usage with custom thresholds", () => {
    const thresholds = { warning: 10, critical: 20, imminent: 30, };

    expect(getThresholdState(5, thresholds,),).toBe("healthy",);
    expect(getThresholdState(10, thresholds,),).toBe("warning",);
    expect(getThresholdState(25, thresholds,),).toBe("critical",);
    expect(getThresholdState(30, thresholds,),).toBe("imminent",);
  });
});

describe("injectMemories", () => {
  function baseContext(totalTokens: number, maxTokens = 100,): ContextWindow {
    return computeContextWindow(
      [makeMsg("base", "x", 0, { tokenCount: totalTokens, },),],
      maxTokens,
    );
  }

  function makeMemory(id: string, tokenCount: number,): MemoryRef {
    return { memoryId: id, actorId: "a1", source: "world", content: id, tokenCount, relevanceScore: 0.5, };
  }

  it("returns the context unchanged when no token budget remains", () => {
    const context = baseContext(100,);

    const result = injectMemories(context, [makeMemory("m1", 10,),],);

    expect(result.injectedMemories,).toEqual([],);
    expect(result.totalTokens,).toBe(100,);
  });

  it("accepts memories that fit and skips those that do not", () => {
    const context = baseContext(60,);

    const result = injectMemories(context, [
      makeMemory("m1", 30,),
      makeMemory("m2", 20,),
      makeMemory("m3", 10,),
    ],);

    // 30 fits; 30+20=50 exceeds the 40 remaining; 30+10=40 fits exactly.
    expect(result.injectedMemories.map((m,) => m.memoryId,),).toEqual(["m1", "m3",],);
    expect(result.totalTokens,).toBe(100,);
    expect(result.usagePercentage,).toBe(100,);
  });

  it("rejects a memory larger than the entire remaining budget", () => {
    const context = baseContext(60,);

    const result = injectMemories(context, [makeMemory("big", 41,),],);

    expect(result.injectedMemories,).toEqual([],);
    expect(result.totalTokens,).toBe(60,);
  });

  it("appends to previously injected memories", () => {
    let context = baseContext(60,);
    context = injectMemories(context, [makeMemory("m1", 10,),],);
    context = injectMemories(context, [makeMemory("m2", 10,),],);

    expect(context.injectedMemories.map((m,) => m.memoryId,),).toEqual(["m1", "m2",],);
    expect(context.totalTokens,).toBe(80,);
  });
});

describe("injectEvents", () => {
  function baseContext(totalTokens: number, maxTokens = 100,): ContextWindow {
    return computeContextWindow(
      [makeMsg("base", "x", 0, { tokenCount: totalTokens, },),],
      maxTokens,
    );
  }

  function makeEvent(id: string, tokenCount: number,): EventRef {
    return { eventId: id, type: "global", content: id, tokenCount, };
  }

  it("returns the context unchanged when no token budget remains", () => {
    const context = baseContext(100,);

    const result = injectEvents(context, [makeEvent("e1", 10,),],);

    expect(result.injectedEvents,).toEqual([],);
    expect(result.totalTokens,).toBe(100,);
  });

  it("accepts events that fit and skips those that do not", () => {
    const context = baseContext(50,);

    const result = injectEvents(context, [
      makeEvent("e1", 30,),
      makeEvent("e2", 25,),
      makeEvent("e3", 10,),
    ],);

    // 30 fits; 30+25=55 exceeds the 50 remaining; 30+10=40 fits.
    expect(result.injectedEvents.map((e,) => e.eventId,),).toEqual(["e1", "e3",],);
    expect(result.totalTokens,).toBe(90,);
    expect(result.usagePercentage,).toBe(90,);
  });

  it("appends to previously injected events", () => {
    let context = baseContext(50,);
    context = injectEvents(context, [makeEvent("e1", 10,),],);
    context = injectEvents(context, [makeEvent("e2", 10,),],);

    expect(context.injectedEvents.map((e,) => e.eventId,),).toEqual(["e1", "e2",],);
    expect(context.totalTokens,).toBe(70,);
  });
});
