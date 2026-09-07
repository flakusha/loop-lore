import { describe, expect, it, } from "bun:test";
import { calculateDestructionProgress, } from "../../../story/quests/calculators/destruction";

describe("story/quests/calculators/destruction (0% -> real logic)", () => {
  it("returns 0 when config is null", () => {
    expect(calculateDestructionProgress(null as any, null, {} as any,),).toBe(0,);
  });
  it("returns 0 for non-combat events", () => {
    const event = { type: "chat_message", data: {}, };
    expect(calculateDestructionProgress(null as any, { type: "destruction", targetQuantity: 5, }, event as any,),).toBe(
      0,
    );
  });
  it("returns 0 when enemy not defeated", () => {
    const event = { type: "combat_event", data: { defeated: false, }, };
    expect(calculateDestructionProgress(null as any, { type: "destruction", targetQuantity: 5, }, event as any,),).toBe(
      0,
    );
  });
  it("returns 1 when targeted actor is defeated", () => {
    const event = { type: "combat_event", data: { defeated: true, defenderId: "e1", }, };
    expect(
      calculateDestructionProgress(
        null as any,
        { type: "destruction", targetQuantity: 5, targetActorId: "e1", },
        event as any,
      ),
    ).toBe(
      1,
    );
  });
  it("returns 0 when non-targeted actor defeated", () => {
    const event = { type: "combat_event", data: { defeated: true, defenderId: "e2", }, };
    expect(
      calculateDestructionProgress(
        null as any,
        { type: "destruction", targetQuantity: 5, targetActorId: "e1", },
        event as any,
      ),
    ).toBe(
      0,
    );
  });
  it("returns percentage progress when no target actor", () => {
    const event = { type: "combat_event", data: { defeated: true, }, };
    expect(calculateDestructionProgress(null as any, { type: "destruction", targetQuantity: 4, }, event as any,),).toBe(
      25,
    );
  });
});
