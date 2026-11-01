// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { citationClickThrough, mrr, ndcgAtK, precisionAtK, recallAtK, } from "./metrics";

describe("citationClickThrough", () => {
  test("half clicked", () => expect(citationClickThrough([{ id: "a", }, { id: "b", },], ["a",],),).toBe(0.5,));
  test("none", () => expect(citationClickThrough([{ id: "a", },], [],),).toBe(0,));
  test("empty citations", () => expect(citationClickThrough([], ["a",],),).toBe(0,));
});

describe("recallAtK", () => {
  test("half of expected inside top k", () => expect(recallAtK(["a", "b", "c",], ["a", "c",], 2,),).toBe(0.5,));
  test("all recalled when k covers the list", () => expect(recallAtK(["a", "b",], ["a", "b",], 5,),).toBe(1,));
  test("empty expected is perfect recall by convention", () => expect(recallAtK(["a",], [], 3,),).toBe(1,));
  test("relevant item below the k cut is not recalled", () => expect(recallAtK(["x", "a",], ["a",], 1,),).toBe(0,));
});

describe("mrr", () => {
  test("first relevant at rank 2", () => expect(mrr(["x", "a", "b",], ["a", "b",],),).toBe(0.5,));
  test("relevant item at rank 1", () => expect(mrr(["a",], ["a",],),).toBe(1,));
  test("no relevant item in the list", () => expect(mrr(["x", "y",], ["a",],),).toBe(0,));
  test("empty list", () => expect(mrr([], ["a",],),).toBe(0,));
  test("empty expected has no candidate to rank", () => expect(mrr(["a",], [],),).toBe(0,));
});

describe("ndcgAtK", () => {
  const grades = { a: 2, b: 1, };

  test("perfect ranking scores 1", () => expect(ndcgAtK(["a", "b",], grades, 2,),).toBe(1,));

  test("hand-computed reversed ranking", () => {
    // dcg  = (2^1-1)/log2(2) + (2^2-1)/log2(3) ≈ 2.89279
    // idcg = (2^2-1)/log2(2) + (2^1-1)/log2(3) ≈ 3.63093
    expect(ndcgAtK(["b", "a",], grades, 2,),).toBeCloseTo(0.79671, 4,);
  });

  test("k truncation ignores beyond-k items", () => {
    // Only "c" (unrated, gain 0) is inside k=1; "a" is cut off.
    expect(ndcgAtK(["c", "a",], { a: 1, }, 1,),).toBe(0,);
  });

  test("unrated item above a relevant one discounts the gain", () => {
    // dcg = 0/log2(2) + (2^1-1)/log2(3) ≈ 0.63093; idcg = 1
    expect(ndcgAtK(["b", "a",], { a: 1, }, 2,),).toBeCloseTo(0.63093, 4,);
  });

  test("empty or all-zero grades score 0", () => {
    expect(ndcgAtK(["a",], {}, 3,),).toBe(0,);
    expect(ndcgAtK(["a",], { a: 0, }, 3,),).toBe(0,);
  });
});

describe("precisionAtK", () => {
  test("half the top k is relevant", () => expect(precisionAtK(["a", "x", "b",], ["a", "b",], 2,),).toBe(0.5,));
  test("k beyond the list divides by the prefix", () => expect(precisionAtK(["a", "b",], ["a", "b",], 3,),).toBe(1,));
  test("empty list", () => expect(precisionAtK([], ["a",], 3,),).toBe(0,));
  test("k = 0 has no prefix to score", () => expect(precisionAtK(["a",], ["a",], 0,),).toBe(0,));
  test("none of the top k is relevant", () => expect(precisionAtK(["x", "y",], ["a",], 2,),).toBe(0,));
});
