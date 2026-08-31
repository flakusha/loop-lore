import { describe, expect, it, } from "bun:test";
import { ContextCompactor, estimateTokens, } from "./context-compactor";
import type { GenerationMessage, } from "./gen-types-options";

/**
 * @param role
 * @param len
 */
function msg(role: string, len: number,): GenerationMessage {
  return { role: role as GenerationMessage["role"], content: "x".repeat(len,), };
}

describe("ContextCompactor", () => {
  it("estimateTokens uses chars * 0.3", () => {
    expect(estimateTokens("a".repeat(100,),),).toBe(30,);
  });

  it("returns input unchanged when under threshold", async () => {
    const c = new ContextCompactor();
    const messages = [msg("user", 10,), msg("assistant", 10,),];
    const res = await c.compact(messages, 1000,);
    expect(res.compacted,).toBe(false,);
    expect(res.messages,).toHaveLength(2,);
  });

  it("compacts when over threshold and preserves last messages", async () => {
    const c = new ContextCompactor({ keepLast: 2, },);
    const messages = Array.from({ length: 20, }, () => msg("user", 500,),);
    const res = await c.compact(messages, 1000,);
    expect(res.compacted,).toBe(true,);
    // summary message + 2 kept
    expect(res.messages,).toHaveLength(3,);
    expect(res.messages[0]?.content,).toContain("[Conversation Summary]",);
    expect(res.droppedTokens,).toBeGreaterThan(0,);
  });

  it("does not compact when fewer messages than keepLast", async () => {
    const c = new ContextCompactor({ keepLast: 10, },);
    const messages = Array.from({ length: 3, }, () => msg("user", 5000,),);
    const res = await c.compact(messages, 100,);
    expect(res.compacted,).toBe(false,);
  });

  it("uses injected summarizer", async () => {
    const c = new ContextCompactor({ keepLast: 1, summarizer: () => "CUSTOM", },);
    const messages = Array.from({ length: 5, }, () => msg("user", 400,),);
    const res = await c.compact(messages, 100,);
    expect(res.compacted,).toBe(true,);
    expect(res.messages[0]?.content,).toBe("[Conversation Summary]\nCUSTOM",);
  });
});
