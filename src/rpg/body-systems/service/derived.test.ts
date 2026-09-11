// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Tests for derived body-system stats (pure math over BodyProfile). */
import { describe, expect, test, } from "bun:test";
import { BodyBuild, SizeCategory, } from "../../../db/enums";
import {
  calculateArousalModifier,
  calculateAvailableActions,
  calculateEncounterDuration,
} from "./derived";
import type { BodyProfile, } from "./types";

function profile(overrides: Partial<BodyProfile> = {},): BodyProfile {
  return {
    id: "bp-1",
    actorId: "actor-1",
    stamina: 45,
    flexibility: 35,
    sensitivity: 50,
    endurance: 55,
    sizeCategory: SizeCategory.Average,
    build: BodyBuild.Average,
    beauty: 50,
    charisma: 50,
    style: 50,
    scent: null,
    modifications: [],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    ...overrides,
  };
}

describe("calculateEncounterDuration", () => {
  test("floors stamina plus endurance over ten", () => {
    expect(calculateEncounterDuration(profile(),),).toBe(10,);
    expect(calculateEncounterDuration(profile({ stamina: 44, endurance: 55, },),),).toBe(9,);
  });
});

describe("calculateAvailableActions", () => {
  test("applies the build bonus on top of flexibility", () => {
    // flexibility 35 → base 3.
    expect(calculateAvailableActions(profile({ build: BodyBuild.Athletic, },),),).toBe(5,);
    expect(calculateAvailableActions(profile({ build: BodyBuild.Slim, },),),).toBe(4,);
    expect(calculateAvailableActions(profile({ build: BodyBuild.Average, },),),).toBe(3,);
    expect(calculateAvailableActions(profile({ build: BodyBuild.Heavy, },),),).toBe(2,);
  });

  test("never drops below one action", () => {
    const low = profile({ flexibility: 5, build: BodyBuild.Heavy, },);
    expect(calculateAvailableActions(low,),).toBe(1,);
  });
});

describe("calculateArousalModifier", () => {
  test("scales from 0.5 to 2.0 across the sensitivity range", () => {
    expect(calculateArousalModifier(profile({ sensitivity: 0, },),),).toBe(0.5,);
    expect(calculateArousalModifier(profile({ sensitivity: 50, },),),).toBe(1.25,);
    expect(calculateArousalModifier(profile({ sensitivity: 100, },),),).toBe(2,);
  });
});
