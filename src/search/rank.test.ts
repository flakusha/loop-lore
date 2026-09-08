import { describe, expect, it, } from "bun:test";
import { fuzzyScore, reciprocalRankFusion, } from "./rank";
import type { SearchHit, } from "./types";

function hit(id: string, score: number,): SearchHit<string> {
  return { id, score, source: "fts", payload: id, };
}

describe("search/rank (RRF fusion)", () => {
  it("ranks rows present in multiple lists first", () => {
    const fused = reciprocalRankFusion([[hit("a", 0.9,),], [hit("a", 0.8,), hit("b", 0.7,),],], 10,);
    expect(fused[0]?.id,).toBe("a",);
    expect(fused[0]?.source,).toBe("fused",);
    expect(fused.map((h,) => h.id),).toEqual(["a", "b",],);
  });
  it("caps at topK and sorts descending", () => {
    const fused = reciprocalRankFusion([[hit("a", 1,), hit("b", 1,), hit("c", 1,),],], 2,);
    expect(fused,).toHaveLength(2,);
    expect(fused[0]!.score,).toBeGreaterThanOrEqual(fused[1]!.score,);
  });
  it("scores stay within [0, 1]", () => {
    const fused = reciprocalRankFusion([[hit("a", 1,),], [hit("a", 1,),], [hit("a", 1,),],], 5,);
    for (const h of fused) { expect(h.score,).toBeLessThanOrEqual(1,); }
  });
});

describe("search/rank (fuzzyScore baseline)", () => {
  it("exact match scores 1 regardless of case", () => {
    expect(fuzzyScore("Tavern", "tavern",),).toBe(1,);
  });
  it("prefix hit outranks later substring hit", () => {
    expect(fuzzyScore("tav", "Tavern interior",),).toBeGreaterThan(fuzzyScore("tav", "Old tavern",),);
    expect(fuzzyScore("tav", "Tavern interior",),).toBeLessThan(1,);
  });
  it("no match and empty input score 0", () => {
    expect(fuzzyScore("xyz", "Tavern interior",),).toBe(0,);
    expect(fuzzyScore("", "Tavern",),).toBe(0,);
    expect(fuzzyScore("tav", "",),).toBe(0,);
  });
});
