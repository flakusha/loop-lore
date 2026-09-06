import { describe, expect, it, } from "bun:test";
import { calculateTimeProgress, } from "../../../story/quests/calculators/time";

describe("story/quests/calculators/time (0% -> real)", () => {
  it("returns 0 with null config", () => {
    expect(
      calculateTimeProgress(
        { progress: 0, },
        null,
        { type: "time_advancement", data: { minutesAdvanced: 30, }, } as any,
      ),
    ).toBe(0,);
  });
  it("returns 0 for wrong event", () => {
    expect(calculateTimeProgress({ progress: 0, }, { durationMinutes: 100, }, { type: "chat", data: {}, } as any,),)
      .toBe(0,);
  });
  it("returns 50 for 50 of 100 minutes", () => {
    expect(
      calculateTimeProgress(
        { progress: 0, },
        { durationMinutes: 100, },
        { type: "time_advancement", data: { minutesAdvanced: 50, }, } as any,
      ),
    ).toBe(50,);
  });
});
