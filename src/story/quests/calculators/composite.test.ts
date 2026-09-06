import { describe, expect, it, } from "bun:test";
import { calculateCompositeProgress, } from "../../../story/quests/calculators/composite";

describe("story/quests/calculators/composite (stub, real)", () => {
  it("stub always returns 0", () => {
    expect(calculateCompositeProgress({ progress: 99, }, null, { type: "any", } as any,),).toBe(0,);
  });
});
