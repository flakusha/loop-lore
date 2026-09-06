import { describe, expect, it, } from "bun:test";
import { calculateRescueProgress, } from "../../../story/quests/calculators/rescue";

describe("story/quests/calculators/rescue (0% -> real)", () => {
  it("returns 0 with null config", () => {
    expect(
      calculateRescueProgress(
        { progress: 0, },
        null,
        { type: "location_change", actorId: "a", locationId: "l", } as any,
      ),
    ).toBe(0,);
  });
  it("returns 0 for wrong event type", () => {
    expect(
      calculateRescueProgress(
        { progress: 0, },
        { targetActorId: "t", safeLocationId: "s", },
        { type: "chat", actorId: "t", locationId: "s", } as any,
      ),
    ).toBe(0,);
  });
  it("returns 100-progress when actor at safe location", () => {
    expect(
      calculateRescueProgress(
        { progress: 20, },
        { targetActorId: "t", safeLocationId: "s", },
        { type: "location_change", actorId: "t", locationId: "s", } as any,
      ),
    ).toBe(80,);
  });
});
