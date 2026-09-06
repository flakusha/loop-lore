import { describe, expect, it, } from "bun:test";
import { calculateDiscoveryProgress, } from "../../../story/quests/calculators/discovery";

describe("story/quests/calculators/discovery (0% -> real)", () => {
  it("returns 0 when config null", () => {
    expect(calculateDiscoveryProgress({ progress: 0, }, null, { type: "location_change", locationId: "a", } as any,),)
      .toBe(0,);
  });
  it("returns 0 for non-location-change events", () => {
    expect(
      calculateDiscoveryProgress(
        { progress: 0, },
        { targetLocationId: "t", clues: [], },
        { type: "chat", locationId: "t", } as any,
      ),
    ).toBe(0,);
  });
  it("returns 100-progress for target location", () => {
    expect(
      calculateDiscoveryProgress(
        { progress: 20, },
        { targetLocationId: "t", clues: [], },
        { type: "location_change", locationId: "t", } as any,
      ),
    ).toBe(80,);
  });
  it("returns clue progress", () => {
    expect(
      calculateDiscoveryProgress(
        { progress: 0, },
        { targetLocationId: "t", clues: [{ locationId: "c1", },], },
        { type: "location_change", locationId: "c1", } as any,
      ),
    ).toBe(Math.round(100 / 2,),);
  });
});
