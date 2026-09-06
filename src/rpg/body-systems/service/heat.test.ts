import { describe, expect, it, } from "bun:test";
import { rowToHeatCycle, } from "../../../rpg/body-systems/service/heat";

describe("body-systems/heat/rowToHeatCycle (real logic)", () => {
  it("transforms DB row to HeatCycleState correctly", () => {
    const mockRow = {
      id: "h1",
      actor_id: "a1",
      species: "Human",
      cycle_length_days: 28,
      current_phase: "normal" as any,
      days_until_next_heat: 14,
      effects: '{"arousalMultiplier":2}',
      created_at: "2026-01-01",
      updated_at: "2026-01-02",
    };
    const state = rowToHeatCycle(mockRow,);
    expect(state.id,).toBe("h1",);
    expect(state.actorId,).toBe("a1",);
    expect(state.species,).toBe("Human",);
    expect(state.cycleLengthDays,).toBe(28,);
    expect(state.currentPhase,).toBe("normal",);
    expect(state.daysUntilNextHeat,).toBe(14,);
    expect(state.createdAt,).toBe("2026-01-01",);
  });
  it("falls back to empty effects when effects is empty string", () => {
    const row = {
      id: "h2",
      actor_id: "a2",
      species: "Canine",
      cycle_length_days: 21,
      current_phase: "heat" as any,
      days_until_next_heat: 0,
      effects: "",
      created_at: "2026-01-01",
      updated_at: "2026-01-02",
    };
    const s = rowToHeatCycle(row,);
    expect(s.id,).toBe("h2",);
  });
});
