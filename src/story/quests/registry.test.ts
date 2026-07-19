import type { CollectionQuestConfig, TimeQuestConfig, WorldEvent, } from "../types";
import { PROGRESS_CALCULATORS, } from "./registry";
import { QuestType, WorldEventType, } from "../../db/enums";
import { describe, expect, it } from "bun:test";
import { describe, expect, it, } from "bun:test";

function makeEvent(type: WorldEventType, data: Record<string, unknown> = {},): WorldEvent {
  return { type, timestamp: "2024-01-01T00:00:00Z", data, description: "", };
}

describe("PROGRESS_CALCULATORS registry", () => {
  it("registers a calculator for every QuestType", () => {
    expect(Object.keys(PROGRESS_CALCULATORS,).sort(),).toEqual(Object.values(QuestType,).sort(),);
  });

  it("dispatches time progress as a percentage of duration", () => {
    const cfg: TimeQuestConfig = {
      type: "time",
      durationMinutes: 120,
      trackInGameTime: true,
      milestones: [],
    };
    const result = PROGRESS_CALCULATORS[QuestType.Time](
      { progress: 0, target: 100, },
      cfg,
      makeEvent(WorldEventType.TimeAdvancement, { minutesAdvanced: 60, },),
    );
    expect(result,).toBe(50,);
  });

  it("dispatches collection progress by matching item name", () => {
    const cfg: CollectionQuestConfig = {
      type: "collection",
      items: [
        { itemId: "Sword", quantity: 2, },
        { itemId: "Shield", quantity: 1, },
      ],
      sources: [],
    };
    const matched = PROGRESS_CALCULATORS[QuestType.Collection](
      { progress: 0, target: 100, },
      cfg,
      makeEvent(WorldEventType.ItemTransfer, { itemName: "Iron Sword", },),
    );
    // totalQuantity = 3, name matches "sword" → round(100 / 3) = 33
    expect(matched,).toBe(33,);
  });

  it("returns 0 for an unmatched collection item", () => {
    const cfg: CollectionQuestConfig = {
      type: "collection",
      items: [{ itemId: "Sword", quantity: 2, },],
      sources: [],
    };
    const missed = PROGRESS_CALCULATORS[QuestType.Collection](
      { progress: 0, target: 100, },
      cfg,
      makeEvent(WorldEventType.ItemTransfer, { itemName: "Potion", },),
    );
    expect(missed,).toBe(0,);
  });

  it("returns 0 when the event type does not apply", () => {
    const cfg: TimeQuestConfig = {
      type: "time",
      durationMinutes: 120,
      trackInGameTime: true,
      milestones: [],
    };
    const wrongEvent = PROGRESS_CALCULATORS[QuestType.Time](
      { progress: 0, target: 100, },
      cfg,
      makeEvent(WorldEventType.CombatEvent,),
    );
    expect(wrongEvent,).toBe(0,);
  });

  it("returns 0 when no config is supplied", () => {
    const noConfig = PROGRESS_CALCULATORS[QuestType.Time](
      { progress: 0, target: 100, },
      null,
      makeEvent(WorldEventType.TimeAdvancement, { minutesAdvanced: 60, },),
    );
    expect(noConfig,).toBe(0,);
  });
});
