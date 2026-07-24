import { describe, expect, it, } from "bun:test";
import {
  DEFAULT_PRUNING_CONFIG,
  pruneMessages,
  type ScorableMessage,
  scoreMessage,
} from "./pruning";

function makeMsg(
  id: string,
  content: string,
  index: number,
  total: number,
  opts?: { hasMemoryLink?: boolean; hasAttachment?: boolean; reactionCount?: number; role?: string },
): ScorableMessage {
  return {
    id,
    content,
    role: (opts?.role ?? "user") as ScorableMessage["role"],
    index,
    total,
    hasMemoryLink: opts?.hasMemoryLink,
    hasAttachment: opts?.hasAttachment,
    reactionCount: opts?.reactionCount,
  };
}

describe("scoreMessage", () => {
  it("scores recent messages higher", () => {
    const early = makeMsg("1", "Hello world", 0, 10,);
    const late = makeMsg("2", "Hello world", 9, 10,);
    expect(scoreMessage(late,).combinedScore,).toBeGreaterThan(scoreMessage(early,).combinedScore,);
  });

  it("scores user/character messages higher than system", () => {
    const user = makeMsg("1", "Hello", 5, 10, { role: "user", },);
    const sys = makeMsg("2", "Hello", 5, 10, { role: "system", },);
    expect(scoreMessage(user,).combinedScore,).toBeGreaterThan(scoreMessage(sys,).combinedScore,);
  });

  it("boosts score for lore keywords", () => {
    const plain = makeMsg("1", "Hello world", 5, 10,);
    const lore = makeMsg("2", "The ancient lore of the kingdom", 5, 10,);
    expect(scoreMessage(lore,).combinedScore,).toBeGreaterThan(scoreMessage(plain,).combinedScore,);
  });

  it("boosts score for memory links", () => {
    const noLink = makeMsg("1", "Hello", 5, 10,);
    const withLink = makeMsg("2", "Hello", 5, 10, { hasMemoryLink: true, },);
    expect(scoreMessage(withLink,).combinedScore,).toBeGreaterThan(scoreMessage(noLink,).combinedScore,);
  });

  it("boosts score for attachments", () => {
    const noAtt = makeMsg("1", "Hello", 5, 10,);
    const withAtt = makeMsg("2", "Hello", 5, 10, { hasAttachment: true, },);
    expect(scoreMessage(withAtt,).combinedScore,).toBeGreaterThan(scoreMessage(noAtt,).combinedScore,);
  });

  it("marks messages for promotion when importance is high", () => {
    const msg = makeMsg("1", "The ancient lore of the kingdom", 5, 10, {
      hasMemoryLink: true,
      hasAttachment: true,
    },);
    expect(scoreMessage(msg,).shouldPromote,).toBe(true,);
  });

  it("marks messages with decision keywords", () => {
    const msg = makeMsg("1", "We decided to go north", 5, 10,);
    expect(scoreMessage(msg,).reasons.some((r,) => r.startsWith("keywords",)),).toBe(true,);
  });
});

describe("pruneMessages", () => {
  it("returns empty for empty input", () => {
    const result = pruneMessages([],);
    expect(result.kept,).toEqual([],);
    expect(result.pruned,).toEqual([],);
    expect(result.tokensSaved,).toBe(0,);
  });

  it("keeps all messages when under budget", () => {
    const msgs = [
      makeMsg("1", "Short", 0, 1,),
      makeMsg("2", "Message", 1, 2,),
    ];
    const result = pruneMessages(msgs, {
      ...DEFAULT_PRUNING_CONFIG,
      targetTokens: 100_000,
    },);
    expect(result.kept.length,).toBe(2,);
    expect(result.pruned.length,).toBe(0,);
  });

  it("prunes low-score messages when over budget", () => {
    const msgs = [
      makeMsg("1", "x".repeat(5000,), 0, 5,), // old, long
      makeMsg("2", "y".repeat(5000,), 1, 5,),
      makeMsg("3", "z".repeat(5000,), 2, 5,),
      makeMsg("4", "w".repeat(5000,), 3, 5,),
      makeMsg("5", "v".repeat(5000,), 4, 5,), // recent
    ];
    const result = pruneMessages(msgs, {
      ...DEFAULT_PRUNING_CONFIG,
      targetTokens: 500, // very small target
    },);
    expect(result.pruned.length,).toBeGreaterThan(0,);
    expect(result.tokensSaved,).toBeGreaterThan(0,);
  });

  it("generates summary when pruning", () => {
    const msgs = Array.from(
      { length: 20, },
      (_, i,) => makeMsg(String(i,), `Message ${i} with some content `.repeat(10,), i, 20,),
    );
    const result = pruneMessages(msgs, {
      ...DEFAULT_PRUNING_CONFIG,
      targetTokens: 100,
    },);
    if (result.pruned.length > 0) {
      expect(result.summary,).toBeDefined();
      expect(result.summary,).toContain("Pruned",);
    }
  });

  it("respects strategy configs", () => {
    const msgs = Array.from({ length: 10, }, (_, i,) => makeMsg(String(i,), `Content ${i} `.repeat(20,), i, 10,),);
    const aggressive = pruneMessages(msgs, {
      ...DEFAULT_PRUNING_CONFIG,
      strategy: "aggressive",
      targetTokens: 50,
    },);
    const conservative = pruneMessages(msgs, {
      ...DEFAULT_PRUNING_CONFIG,
      strategy: "conservative",
      targetTokens: 50,
    },);
    // Aggressive should prune more
    expect(aggressive.pruned.length,).toBeGreaterThanOrEqual(conservative.pruned.length,);
  });
});
