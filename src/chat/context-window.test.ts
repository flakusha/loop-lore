// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, it, } from "bun:test";
import { computeContextWindow, } from "./context-window";
import type { MessageRef, } from "./types/context";

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
