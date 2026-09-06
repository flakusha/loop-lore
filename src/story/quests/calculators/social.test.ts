import { describe, expect, it, } from "bun:test";
import { calculateSocialProgress, } from "./social";

describe("story/quests/calculators/social (0% -> real)", () => {
  it("returns 0 for non-target actor", () => {
    expect(
      calculateSocialProgress(
        {} as any,
        { targetActorId: "t", requiredInteractions: 4, },
        { type: "npc_state_change", actorId: "x", data: { npcActorId: "t", }, } as any,
      ),
    ).toBe(0,);
  });
  it("returns 0 for wrong event type", () => {
    expect(
      calculateSocialProgress(
        {} as any,
        { targetActorId: "t", requiredInteractions: 4, },
        { type: "combat", actorId: "t", data: { npcActorId: "t", }, } as any,
      ),
    ).toBe(0,);
  });
  it("returns 25 for target actor interaction with 4 interactions", () => {
    expect(
      calculateSocialProgress(
        {} as any,
        { targetActorId: "t", requiredInteractions: 4, },
        { type: "npc_state_change", actorId: "t", data: { npcActorId: "t", }, } as any,
      ),
    ).toBe(25,);
  });
});
