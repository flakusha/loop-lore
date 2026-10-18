// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import {
  coordDistance,
  estimateTravelMinutes,
  formatEta,
  resolveTravelMethod,
  TRAVEL_METHODS,
  type TravelPoint,
} from "./travel-methods";

const point = (x: number | null, y: number | null,): TravelPoint => ({ coordX: x, coordY: y, });

const WALK = resolveTravelMethod("walk",);
const RIDE = resolveTravelMethod("ride",);
const TELEPORT = resolveTravelMethod("teleport",);

describe("resolveTravelMethod", () => {
  test("resolves the three UI methods", () => {
    expect(WALK.id,).toBe("walk",);
    expect(RIDE.id,).toBe("ride",);
    expect(TELEPORT.id,).toBe("teleport",);
  });

  test("falls back to walk for unknown or missing ids", () => {
    expect(resolveTravelMethod("dragonback",).id,).toBe("walk",);
    expect(resolveTravelMethod(null,).id,).toBe("walk",);
  });

  test("keeps walk/ride/teleport as the selectable set", () => {
    expect(TRAVEL_METHODS.map((m,) => m.id),).toEqual(["walk", "ride", "teleport",],);
  });
});

describe("coordDistance", () => {
  test("euclidean distance between two points", () => {
    expect(coordDistance(point(0, 0,), point(3, 4,),),).toBe(5,);
  });

  test("null when either endpoint lacks coordinates", () => {
    expect(coordDistance(point(null, 0,), point(3, 4,),),).toBeNull();
    expect(coordDistance(point(0, 0,), point(3, null,),),).toBeNull();
  });
});

describe("estimateTravelMinutes", () => {
  test("distance over speed, rounded up to whole minutes", () => {
    // 5 units at 5 units/h = 1h = 60m.
    expect(estimateTravelMinutes(point(0, 0,), point(5, 0,), WALK, null,),).toBe(60,);
    // 7 units at 25 units/h = 0.28h = 16.8m → 17m.
    expect(estimateTravelMinutes(point(0, 0,), point(7, 0,), RIDE, null,),).toBe(17,);
  });

  test("falls back to hop count when coordinates are missing", () => {
    // 1 hop at 5 units/h = 12m.
    expect(estimateTravelMinutes(point(null, null,), point(null, null,), WALK, 1,),).toBe(12,);
  });

  test("unknown when neither coordinates nor hops exist", () => {
    expect(estimateTravelMinutes(point(null, null,), point(null, null,), WALK, null,),).toBeNull();
  });

  test("teleport is instant regardless of distance", () => {
    expect(estimateTravelMinutes(point(0, 0,), point(50, 50,), TELEPORT, null,),).toBe(0,);
  });
});

describe("formatEta", () => {
  test("formats minutes, hours and special values", () => {
    expect(formatEta(45,),).toBe("45m",);
    expect(formatEta(60,),).toBe("1h",);
    expect(formatEta(0,),).toBe("instant",);
    expect(formatEta(null,),).toBe("unknown",);
  });
});
