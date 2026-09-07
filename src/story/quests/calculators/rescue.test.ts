import { describe, expect, it, } from "bun:test";
import { calculateRescueProgress, } from "../../../story/quests/calculators/rescue";

describe("story/quests/calculators/rescue (0% -> real)", () => {
  it("returns 0 with null config", () => {
    expect(
      calculateRescueProgress(
        { progress: 0, target: 0, },
        null,
        { type: "location_change", actorId: "a", locationId: "l", } as any,
      ),
    ).toBe(0,);
  });
  it("returns 0 for wrong event type", () => {
    expect(
      calculateRescueProgress(
        { progress: 0, target: 0, },
        { type: "rescue", targetActorId: "t", safeLocationId: "s", escortRequired: false, threats: [], },
        { type: "chat", actorId: "t", locationId: "s", } as any,
      ),
    ).toBe(0,);
  });
  it("returns 100-progress when actor at safe location", () => {
    expect(
      calculateRescueProgress(
        { progress: 20, target: 0, },
        { type: "rescue", targetActorId: "t", safeLocationId: "s", escortRequired: false, threats: [], },
        { type: "location_change", actorId: "t", locationId: "s", } as any,
      ),
    ).toBe(80,);
  });
});
