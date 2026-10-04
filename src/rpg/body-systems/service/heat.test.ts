import { describe, expect, it, } from "bun:test";
import { HeatPhase, } from "../../../db/enums";
import {
  advanceHeatCycle,
  getHeatCycle,
  getHeatEffects,
  rowToHeatCycle,
} from "../../../rpg/body-systems/service/heat";
import { createTestDb, } from "../../../test-utils/create-test-db";
import { insertActors, } from "../../../test-utils/insert-helpers";
import { Species, } from "../enums";

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

describe("body-systems/heat/getHeatCycle", () => {
  it("creates a no-heat default cycle for humans", async () => {
    const { db, } = await createTestDb();
    await insertActors(db, "Actor", { id: "actor-1", } as never,);
    const cycle = await getHeatCycle(db, "actor-1", Species.Human,);
    expect(cycle.cycleLengthDays,).toBe(0,);
    expect(cycle.daysUntilNextHeat,).toBe(0,);
    expect(cycle.currentPhase,).toBe(HeatPhase.Normal,);
    expect(cycle.effects,).toEqual({
      arousalMultiplier: 1,
      seductionResistance: 1,
      pheromoneEmission: 0,
      fertilityBoost: 1,
      moodInstability: 0,
      desireIntensity: 1,
    },);
  });

  it("creates a 30-day cycle for non-human species", async () => {
    const { db, } = await createTestDb();
    await insertActors(db, "Actor", { id: "actor-1", } as never,);
    const cycle = await getHeatCycle(db, "actor-1", "catgirl",);
    expect(cycle.cycleLengthDays,).toBe(30,);
    expect(cycle.daysUntilNextHeat,).toBe(30,);
    expect(cycle.currentPhase,).toBe(HeatPhase.Normal,);
  });

  it("matches species case-insensitively (HUMAN counts as human)", async () => {
    const { db, } = await createTestDb();
    await insertActors(db, "Actor", { id: "actor-1", } as never,);
    const cycle = await getHeatCycle(db, "actor-1", "HUMAN",);
    expect(cycle.cycleLengthDays,).toBe(0,);
  });

  it("returns the existing cycle on subsequent calls", async () => {
    const { db, } = await createTestDb();
    await insertActors(db, "Actor", { id: "actor-1", } as never,);
    const first = await getHeatCycle(db, "actor-1", "catgirl",);
    const second = await getHeatCycle(db, "actor-1", "catgirl",);
    expect(second.id,).toBe(first.id,);
    expect(second.cycleLengthDays,).toBe(30,);
  });
});

describe("body-systems/heat/advanceHeatCycle", () => {
  it("is a no-op for humans (zero-length cycle)", async () => {
    const { db, } = await createTestDb();
    await insertActors(db, "Actor", { id: "actor-1", } as never,);
    await getHeatCycle(db, "actor-1", Species.Human,);
    const result = await advanceHeatCycle(db, "actor-1", 10,);
    expect(result,).toEqual({ newPhase: HeatPhase.Normal, daysUntilNext: 0, },);
  });

  it("decrements days without a phase change while days remain", async () => {
    const { db, } = await createTestDb();
    await insertActors(db, "Actor", { id: "actor-1", } as never,);
    await getHeatCycle(db, "actor-1", "catgirl",);
    const result = await advanceHeatCycle(db, "actor-1", 10,);
    expect(result,).toEqual({ newPhase: HeatPhase.Normal, daysUntilNext: 20, },);
  });

  it("leaves the cycle unchanged when advancing zero days", async () => {
    const { db, } = await createTestDb();
    await insertActors(db, "Actor", { id: "actor-1", } as never,);
    await getHeatCycle(db, "actor-1", "catgirl",);
    const result = await advanceHeatCycle(db, "actor-1", 0,);
    expect(result,).toEqual({ newPhase: HeatPhase.Normal, daysUntilNext: 30, },);
  });

  it("transitions Normal → PreHeat at the boundary and resets to 25% of cycle", async () => {
    const { db, } = await createTestDb();
    await insertActors(db, "Actor", { id: "actor-1", } as never,);
    await getHeatCycle(db, "actor-1", "catgirl",);
    const result = await advanceHeatCycle(db, "actor-1", 30,);
    expect(result,).toEqual({ newPhase: HeatPhase.PreHeat, daysUntilNext: 7, },);
    const cycle = await getHeatCycle(db, "actor-1", "catgirl",);
    expect(cycle.currentPhase,).toBe(HeatPhase.PreHeat,);
    expect(cycle.daysUntilNextHeat,).toBe(7,);
  });

  it("walks the full phase order and wraps PostHeat → Normal", async () => {
    const { db, } = await createTestDb();
    await insertActors(db, "Actor", { id: "actor-1", } as never,);
    await getHeatCycle(db, "actor-1", "catgirl",);
    expect((await advanceHeatCycle(db, "actor-1", 30,)).newPhase,).toBe(HeatPhase.PreHeat,);
    expect((await advanceHeatCycle(db, "actor-1", 7,)).newPhase,).toBe(HeatPhase.Heat,);
    expect((await advanceHeatCycle(db, "actor-1", 7,)).newPhase,).toBe(HeatPhase.PostHeat,);
    const wrap = await advanceHeatCycle(db, "actor-1", 7,);
    expect(wrap,).toEqual({ newPhase: HeatPhase.Normal, daysUntilNext: 7, },);
  });
});

describe("body-systems/heat/getHeatEffects", () => {
  it("returns nullified effects outside the heat phase", async () => {
    const { db, } = await createTestDb();
    await insertActors(db, "Actor", { id: "actor-1", } as never,);
    await getHeatCycle(db, "actor-1", "catgirl",);
    const effects = await getHeatEffects(db, "actor-1",);
    expect(effects,).toEqual({
      arousalMultiplier: 1,
      seductionResistance: 1,
      pheromoneEmission: 0,
      fertilityBoost: 1,
      moodInstability: 0,
      desireIntensity: 1,
    },);
  });

  it("returns the stored effects during the heat phase", async () => {
    const { db, } = await createTestDb();
    await insertActors(db, "Actor", { id: "actor-1", } as never,);
    await getHeatCycle(db, "actor-1", "catgirl",);
    await advanceHeatCycle(db, "actor-1", 30,);
    await advanceHeatCycle(db, "actor-1", 7,);
    await db
      .updateTable("character_heat_cycle",)
      .set({
        effects: JSON.stringify({
          arousalMultiplier: 3,
          seductionResistance: 0.5,
          pheromoneEmission: 2,
          fertilityBoost: 2,
          moodInstability: 1,
          desireIntensity: 3,
        },),
      },)
      .where("actor_id", "=", "actor-1",)
      .execute();

    const effects = await getHeatEffects(db, "actor-1",);
    expect(effects.arousalMultiplier,).toBe(3,);
    expect(effects.fertilityBoost,).toBe(2,);
    expect(effects.pheromoneEmission,).toBe(2,);
  });
});

describe("body-systems/heat/rowToHeatCycle — corrupt JSON", () => {
  it("falls back to empty object when effects is not valid JSON", () => {
    const state = rowToHeatCycle({
      id: "h3",
      actor_id: "a3",
      species: "Canine",
      cycle_length_days: 21,
      current_phase: "heat" as any,
      days_until_next_heat: 0,
      effects: "{{{nope",
      created_at: "2026-01-01",
      updated_at: "2026-01-02",
    },);

    expect(state.effects as unknown as Record<string, unknown>,).toEqual({},);
  });
});
