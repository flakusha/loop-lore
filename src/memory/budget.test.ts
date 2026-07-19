/**
 * Memory budget tests.
 */
import { describe, expect, it, } from "bun:test";
import { estimateTokens, selectWithinBudget, } from "./budget";

describe("estimateTokens", () => {
  it("estimates tokens from text length", () => {
    expect(estimateTokens("hello",),).toBe(2,);
    expect(estimateTokens("".padEnd(100,),),).toBe(25,);
    expect(estimateTokens("a",),).toBe(1,);
  });
});

describe("selectWithinBudget", () => {
  const mem = (content: string, importance: number, confidence: number, pinned = false,) => ({
    content,
    importance,
    confidence,
    pinned,
  });

  it("returns all memories within budget", () => {
    const items = [mem("short", 5, 0.9,), mem("also short", 3, 0.8,),];
    const result = selectWithinBudget(items, { maxTokens: 1024, },);
    expect(result.length,).toBe(2,);
  });

  it("drops low-importance memories when over budget", () => {
    const items = [
      mem("a".repeat(400,), 10, 0.95,),
      mem("b".repeat(400,), 1, 0.5,),
      mem("c".repeat(400,), 5, 0.7,),
    ];
    const result = selectWithinBudget(items, { maxTokens: 150, },);
    expect(result.some((m,) => m.content.startsWith("a",)),).toBe(true,);
    expect(result.some((m,) => m.content.startsWith("b",)),).toBe(false,);
  });

  it("always keeps pinned memories", () => {
    const items = [
      mem("pinned memory", 1, 0.3, true,),
      mem("unpinned important", 10, 0.95,),
    ];
    const result = selectWithinBudget(items, { maxTokens: 50, respectPins: true, },);
    expect(result.some((m,) => m.pinned),).toBe(true,);
  });

  it("returns empty for zero budget", () => {
    const items = [mem("test", 5, 0.9,),];
    const result = selectWithinBudget(items, { maxTokens: 0, },);
    expect(result.length,).toBe(0,);
  });
});
