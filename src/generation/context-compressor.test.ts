/**
 * Context Compressor — Tests
 *
 * Covers sliding window, truncation, budget enforcement,
 * system message preservation, and edge cases.
 */

import { describe, it, expect } from "bun:test";
import { compressMessages, calculateTotalTokens } from "./context-compressor";
import type { ContextMessage, TokenCountFn } from "./context-window-config";
import { DEFAULT_CONTEXT_WINDOW } from "./context-window-config";

// ── Fixtures ────────────────────────────────────────────────

function systemMsg(content: string): ContextMessage {
  return { role: "system", content };
}

function userMsg(content: string): ContextMessage {
  return { role: "user", content };
}

function assistantMsg(content: string): ContextMessage {
  return { role: "assistant", content };
}

/** Build N pairs of user+assistant messages */
function buildTurns(count: number, userLen = 200, assistantLen = 500): ContextMessage[] {
  const turns: ContextMessage[] = [];
  for (let i = 0; i < count; i++) {
    turns.push(
      userMsg(`User message ${i} `.repeat(userLen / 12)),
      assistantMsg(`Assistant response ${i} `.repeat(assistantLen / 18)),
    );
  }
  return turns;
}

const SYSTEM_PROMPT = systemMsg("You are a helpful assistant.");
const CHAR_CARD = systemMsg("Character: Bob, a friendly wizard. ".repeat(10));
const SMALL_SYSTEM = [SYSTEM_PROMPT, CHAR_CARD];

// ── Token counting helper for tests ─────────────────────────

/** Deterministic token count: 1 token per word */
const wordTokenCount: TokenCountFn = (text: string) => text.split(/\s+/).filter(Boolean).length;

// ── Tests ───────────────────────────────────────────────────

describe("compressMessages — no-op path", () => {
  it("returns empty when given empty", () => {
    const result = compressMessages({ messages: [] });
    expect(result.compressed).toEqual([]);
    expect(result.metadata.originalCount).toBe(0);
    expect(result.metadata.budgetExceeded).toBe(false);
  });

  it("passes through when under budget", () => {
    const msgs = [systemMsg("Short instruction."), userMsg("Hello"), assistantMsg("Hi there!")];
    const result = compressMessages({
      messages: msgs,
      config: { ...DEFAULT_CONTEXT_WINDOW, maxContextTokens: 100_000 },
    });
    expect(result.compressed).toEqual(msgs);
    expect(result.metadata.budgetExceeded).toBe(false);
  });

  it("passes through single message", () => {
    const msgs = [userMsg("Hello")];
    const result = compressMessages({ messages: msgs });
    expect(result.compressed).toEqual(msgs);
  });

  it("passes through conversation exactly at budget threshold", () => {
    const msgs = [
      systemMsg("A".repeat(48)), // ~12 tokens (48/4)
      userMsg("B".repeat(48)), // ~12 tokens
    ];
    // Total ~24 tokens, budget = 32000 * 0.75 = 24000 → fits
    const result = compressMessages({ messages: msgs });
    expect(result.compressed).toEqual(msgs);
    expect(result.metadata.budgetExceeded).toBe(false);
  });
});

describe("compressMessages — truncation strategy", () => {
  const config = {
    ...DEFAULT_CONTEXT_WINDOW,
    strategy: "truncate" as const,
    maxContextTokens: 500,
    minRecentMessages: 3,
    minTurnsAfterCompression: 1,
  };

  it("drops oldest messages when over budget (using word token count)", () => {
    // Each message: ~30 tokens (words), 2 system + 10 conversation = 12 messages
    // Budget: 500 * 0.75 = 375 → system (~85) + conversation should exceed
    const msgs = [...SMALL_SYSTEM, ...buildTurns(10, 100, 200)];
    const result = compressMessages({ messages: msgs, config, tokenCountFn: wordTokenCount });
    expect(result.metadata.budgetExceeded).toBe(true);
    expect(result.metadata.conversationDropped).toBeGreaterThan(0);
    // System messages preserved
    expect(result.compressed.filter((m) => m.role === "system")).toHaveLength(2);
  });

  it("preserves minRecentMessages when dropping", () => {
    const msgs = [...SMALL_SYSTEM, ...buildTurns(20, 100, 100)];
    const result = compressMessages({ messages: msgs, config, tokenCountFn: wordTokenCount });
    expect(result.metadata.conversationKept).toBeGreaterThanOrEqual(1);
    // At least one user+assistant pair
    const keptConversation = result.compressed.filter((m) => m.role !== "system");
    expect(keptConversation.length).toBeGreaterThanOrEqual(2);
  });

  it("keeps system messages intact", () => {
    const msgs = [...SMALL_SYSTEM, ...buildTurns(10, 200, 500)];
    const result = compressMessages({ messages: msgs, config, tokenCountFn: wordTokenCount });
    const keptSystem = result.compressed.filter((m) => m.role === "system");
    expect(keptSystem).toEqual(SMALL_SYSTEM);
    expect(result.metadata.systemCount).toBe(2);
  });

  it("returns metadata with correct counts", () => {
    const msgs = [...SMALL_SYSTEM, ...buildTurns(10, 200, 500)];
    const result = compressMessages({ messages: msgs, config, tokenCountFn: wordTokenCount });
    expect(result.metadata.originalCount).toBe(msgs.length);
    expect(result.metadata.compressedCount).toBeLessThan(msgs.length);
    expect(result.metadata.conversationDropped + result.metadata.conversationKept).toBe(
      msgs.length - result.metadata.systemCount,
    );
  });
});

describe("compressMessages — sliding strategy", () => {
  const config = {
    ...DEFAULT_CONTEXT_WINDOW,
    strategy: "sliding" as const,
    maxContextTokens: 500,
    minRecentMessages: 4,
    minTurnsAfterCompression: 1,
  };

  it("keeps recent messages over older ones", () => {
    const msgs = [...SMALL_SYSTEM, ...buildTurns(15, 50, 60)];
    const result = compressMessages({ messages: msgs, config, tokenCountFn: wordTokenCount });
    expect(result.metadata.budgetExceeded).toBe(true);
    // Last system message (char card) kept
    const kept = result.compressed.filter((m) => m.role !== "system");
    expect(kept.length).toBeGreaterThan(0);
    // Last kept message should be the last assistant message
    const lastOriginal = msgs[msgs.length - 1]!;
    const lastKept = result.compressed[result.compressed.length - 1]!;
    expect(lastKept.content).toBe(lastOriginal.content);
  });

  it("fits more older messages when budget allows", () => {
    // Very small token test: use wordTokenCount for deterministic behavior
    const msgs = [...SMALL_SYSTEM, ...buildTurns(5, 10, 10)];
    const tight = { ...config, maxContextTokens: 200 };
    const loose = { ...config, maxContextTokens: 1000 };
    const tightResult = compressMessages({ messages: msgs, config: tight, tokenCountFn: wordTokenCount });
    const looseResult = compressMessages({ messages: msgs, config: loose, tokenCountFn: wordTokenCount });
    // Loose budget should keep more messages
    expect(looseResult.metadata.conversationKept).toBeGreaterThanOrEqual(
      tightResult.metadata.conversationKept,
    );
  });
});

describe("compressMessages — custom token count function", () => {
  it("uses provided tokenCountFn for all calculations", () => {
    const customCount: TokenCountFn = () => 100; // Each message = 100 tokens
    const msgs = [userMsg("a"), assistantMsg("b")];
    const config = { ...DEFAULT_CONTEXT_WINDOW, maxContextTokens: 150, strategy: "truncate" as const };
    const result = compressMessages({ messages: msgs, config, tokenCountFn: customCount });
    // 2 messages × 100 tokens = 200 > budget (150 * 0.75 = 112) → should compress
    // Actually: 2 × 100 = 200 > 112 → triggers compression
    expect(result.metadata.budgetExceeded).toBe(true);
    // With minTurnsAfterCompression=1 and budget=150*0.75=112,
    // each msg is 100 tokens, can only keep 1 → drops 1
    expect(result.metadata.conversationDropped).toBe(1);
  });
});

describe("compressMessages — edge cases", () => {
  it("handles messages with only system prompts", () => {
    const msgs = [systemMsg("A".repeat(400)), systemMsg("B".repeat(400))];
    const config = { ...DEFAULT_CONTEXT_WINDOW, maxContextTokens: 100, strategy: "truncate" as const };
    // System is always kept, even when it exceeds budget
    const result = compressMessages({ messages: msgs, config });
    expect(result.metadata.budgetExceeded).toBe(true);
    expect(result.compressed).toHaveLength(2); // All system messages kept
  });

  it("handles single user message (no assistant)", () => {
    const msgs = [systemMsg("Hi"), userMsg("Hello")];
    const result = compressMessages({ messages: msgs });
    expect(result.compressed).toEqual(msgs);
  });

  it("handles interleaved system messages (post-history instructions)", () => {
    const msgs = [
      systemMsg("Main instruction."),
      userMsg("Hi"),
      assistantMsg("Hello"),
      systemMsg("Post-history instruction."), // Non-leading system message
    ];
    const config = { ...DEFAULT_CONTEXT_WINDOW, maxContextTokens: 20, strategy: "truncate" as const };
    const result = compressMessages({ messages: msgs, config, tokenCountFn: wordTokenCount });
    // splitSystemMessages only collects leading system messages
    const systemCount = msgs.filter((m) => m.role === "system").length;
    expect(result.metadata.systemCount).toBeLessThan(systemCount); // post-history treated as conversation
  });

  it("provides CompressionResult metadata shape", () => {
    const msgs = buildTurns(3, 100, 200);
    const result = compressMessages({ messages: msgs });
    expect(result).toHaveProperty("compressed");
    expect(result).toHaveProperty("metadata");
    expect(result.metadata).toHaveProperty("originalTokens");
    expect(result.metadata).toHaveProperty("compressedTokens");
    expect(result.metadata).toHaveProperty("originalCount");
    expect(result.metadata).toHaveProperty("compressedCount");
    expect(result.metadata).toHaveProperty("systemCount");
    expect(result.metadata).toHaveProperty("conversationDropped");
    expect(result.metadata).toHaveProperty("conversationKept");
    expect(result.metadata).toHaveProperty("budgetExceeded");
  });
});

describe("calculateTotalTokens", () => {
  it("counts content + structural overhead", () => {
    const msgs = [userMsg("hello")];
    const tokens = calculateTotalTokens(msgs, wordTokenCount);
    // "hello" = 1 word token, "60" (overhead as string) = 1 word token
    expect(tokens).toBe(2);
  });

  it("includes name in token count when present", () => {
    const msg: ContextMessage = { role: "user", content: "hi", name: "Bob" };
    const tokens = calculateTotalTokens([msg], wordTokenCount);
    // "hi" + "Bob" = "hiBob" = 1 word token (no separator), "60" (overhead) = 1
    expect(tokens).toBe(2);
  });

  it("returns 0 for empty array", () => {
    expect(calculateTotalTokens([])).toBe(0);
  });

  it("sums multiple messages", () => {
    const msgs = [userMsg("a"), assistantMsg("b c")];
    const tokens = calculateTotalTokens(msgs, wordTokenCount);
    // msg1: "a" = 1 + overhead "60" = 1 → 2
    // msg2: "b c" = 2 + overhead "60" = 1 → 3
    expect(tokens).toBe(5);
  });
});
