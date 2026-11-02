import { describe, expect, test, } from "bun:test";
import {
  DEFAULT_PRUNING_CONFIG,
  pruneMessages,
  type ScorableMessage,
  scoreMessage,
} from "./pruning";
import { estimateTokens, } from "./token-utils";

/**
 * @param id
 * @param content
 * @param index
 * @param total
 * @param opts
 * @param opts.hasMemoryLink
 * @param opts.hasAttachment
 * @param opts.reactionCount
 * @param opts.role
 * @returns minimal scorable message
 */
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

describe("scoreMessage — degenerate and boundary inputs", () => {
  test("total = 0 falls back to the neutral recency midpoint", () => {
    const msg = makeMsg("m", "Hello there", 0, 0, { role: "system", },);
    const score = scoreMessage(msg,);
    // recency 0.5 * 0.3 + system role 0.3 * 0.2, no keyword/attachment input.
    expect(score.relevanceScore,).toBeCloseTo(0.21, 12,);
    expect(score.reasons,).toEqual([],);
  });

  test("the 'recent' reason switches on strictly above 0.7 recency", () => {
    const atThreshold = scoreMessage(makeMsg("a", "Hello", 7, 10, { role: "system", },),);
    expect(atThreshold.reasons,).toEqual([],);

    const pastThreshold = scoreMessage(makeMsg("b", "Hello", 8, 10, { role: "system", },),);
    expect(pastThreshold.reasons,).toEqual(["recent",],);
  });

  test("keyword contribution caps at four matches while reasons report the raw count", () => {
    const four = scoreMessage(makeMsg("a", "lore decide fear castle", 5, 10,),);
    const six = scoreMessage(makeMsg("b", "lore decide fear castle secret vow", 5, 10,),);

    expect(six.reasons,).toContain("keywords(6)",);
    expect(six.relevanceScore,).toBeCloseTo(four.relevanceScore, 12,);
  });

  test("a single keyword match stays silent, two announce themselves", () => {
    const one = scoreMessage(makeMsg("a", "ancient lore", 5, 10,),);
    expect(one.reasons.some((r,) => r.startsWith("keywords",)),).toBe(false,);

    const two = scoreMessage(makeMsg("b", "lore and decide", 5, 10,),);
    expect(two.reasons,).toContain("keywords(2)",);
  });

  test("reaction contribution caps at five reactions", () => {
    const five = scoreMessage(makeMsg("a", "Hello", 5, 10, { reactionCount: 5, },),);
    const fifty = scoreMessage(makeMsg("b", "Hello", 5, 10, { reactionCount: 50, },),);

    expect(fifty.reasons,).toContain("reactions(50)",);
    expect(fifty.relevanceScore,).toBeCloseTo(five.relevanceScore, 12,);
  });

  test("shouldPromote fires exactly at the 0.6 importance boundary", () => {
    // user role 0.1 + keywordScore 1.0 * 0.5 = 0.6 → promoted.
    const atBoundary = scoreMessage(makeMsg("a", "lore decide fear castle", 5, 10,),);
    expect(atBoundary.shouldPromote,).toBe(true,);

    // 3 matches → 0.75 * 0.5 + 0.1 = 0.475 → not promoted.
    const belowBoundary = scoreMessage(makeMsg("b", "lore decide fear", 5, 10,),);
    expect(belowBoundary.shouldPromote,).toBe(false,);

    // system role drops the 0.1 participant bonus → 0.5 → not promoted.
    const systemRole = scoreMessage(makeMsg("c", "lore decide fear castle", 5, 10, { role: "system", },),);
    expect(systemRole.shouldPromote,).toBe(false,);
  });
});

describe("pruneMessages — edge cases", () => {
  // The 0.8·target floor in selectMessagesToPrune refuses to prune when the
  // only candidate would land below it — an incompressible transcript is
  // returned over budget and the caller must handle that.
  test("a single over-budget message is never pruned", () => {
    const result = pruneMessages(
      [makeMsg("m1", "x".repeat(1000,), 0, 1,),],
      { ...DEFAULT_PRUNING_CONFIG, targetTokens: 50, },
    );

    expect(result.kept,).toHaveLength(1,);
    expect(result.pruned,).toEqual([],);
    expect(result.promoted,).toEqual([],);
    expect(result.tokensSaved,).toBe(0,);
    expect(result.summary,).toBeUndefined();
  });

  // Promote-before-remove is the documented algorithm, so a promoted message
  // is intentionally reported in BOTH buckets: callers persist it to memory
  // AND drop it from context.
  test("promoted messages appear in both promoted and pruned buckets", () => {
    // m1: old user message with exactly 4 keyword matches → relevance 0.4,
    // importance exactly 0.6 (promoted), 100 chars ≈ 25 tokens (ceil(len/4)).
    const m1 = makeMsg("m1", `lore decide fear castle ${"x".repeat(76,)}`, 0, 4,);
    // m2: old system message, lowest score, pruned first.
    const m2 = makeMsg("m2", "y".repeat(100,), 1, 4, { role: "system", },);
    // m3: recent user message, too large to prune without breaking the floor.
    const m3 = makeMsg("m3", "z".repeat(400,), 3, 4,);

    const result = pruneMessages(
      [m1, m2, m3,],
      { ...DEFAULT_PRUNING_CONFIG, targetTokens: 100, },
    );

    expect((result.kept as ScorableMessage[]).map((msg,) => msg.id),).toEqual(["m3",],);
    expect((result.promoted as ScorableMessage[]).map((msg,) => msg.id),).toEqual(["m1",],);
    expect((result.pruned as ScorableMessage[]).map((msg,) => msg.id),).toEqual(["m1", "m2",],);
    expect(result.summary,).toBe(
      "[Context Pruned] Removed 2 message(s), promoted 1 to memory. Strategy: balanced.",
    );

    expect(result.tokensSaved,).toBe(
      estimateTokens(m1.content,) + estimateTokens(m2.content,),
    );
  });
});
