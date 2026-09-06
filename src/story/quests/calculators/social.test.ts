import { describe, expect, it, } from "bun:test";
import { calculateSocialProgress, } from "../../../story/quests/calculators/social";

describe("story/quests/calculators/social (0% -> real)", () => {
  it("returns 0 when config null", () => {
    expect(calculateSocialProgress({} as any, null, { type: "npc_state_change", actorId: "a", } as any,),).toBe(0,);
  });
  it("returns 0 for non-npc_state_change events", () => {
    expect(
      calculateSocialProgress(
        {} as any,
        { targetActorId: "t", requiredInteractions: 4, },
        { type: "combat", actorId: "t", } as any,
      ),
    ).toBe(0,);
  });
  it("returns progress for target actor interaction", () => {
    expect(
      calculateSocialProgress(
        {} as any,
        { targetActorId: "t", requiredInteractions: 4, },
        { type: "npc_state_change", actorId: "t", } as any,
      ),
    ).toBe(25,);
  });
  it("returns 0 for non-target actor", () => {
    expect(
      calculateSocialProgress(
        {} as any,
        { targetActorId: "t", requiredInteractions: 4, },
        { type: "npc_state_change", actorId: "x", data: {}, } as any,
      ),
    ).toBe(0,);
  });
});
