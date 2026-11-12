// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, test, } from "bun:test";
import { decideRegenRoute, } from "./regen-gate";

const ACTIONS = ["try-again", "add-details", "more-concise",];

/** Build gate inputs with sensible defaults. */
function input(overrides?: Partial<Parameters<typeof decideRegenRoute>[0]>,): Parameters<typeof decideRegenRoute>[0] {
  return {
    explicitAction: undefined,
    knownActions: ACTIONS,
    target: { length: 400, },
    gateEnabled: true,
    ...overrides,
  };
}

describe("decideRegenRoute", () => {
  test("an explicit recognized action always wins, gate on or off", () => {
    expect(decideRegenRoute(input({ explicitAction: "add-details", gateEnabled: true, },),),).toEqual({
      decision: "action",
      action: "add-details",
    },);

    expect(decideRegenRoute(input({ explicitAction: "try-again", gateEnabled: false, },),),).toEqual({
      decision: "action",
      action: "try-again",
    },);
  });

  test("an unknown action id lands on the menu even with the gate on", () => {
    expect(decideRegenRoute(input({ explicitAction: "bogus", },),),).toEqual({ decision: "menu", },);
  });

  test("gate off falls back to the menu regardless of the target", () => {
    expect(decideRegenRoute(input({ gateEnabled: false, target: { length: 5000, }, },),),).toEqual({
      decision: "menu",
    },);
  });

  test("gate on with no target lands on the menu", () => {
    expect(decideRegenRoute(input({ target: undefined, },),),).toEqual({ decision: "menu", },);
  });

  test("a long target suggests the condensing style", () => {
    expect(decideRegenRoute(input({ target: { length: 1200, }, },),),).toEqual({
      decision: "style",
      style: "shorter",
    },);
  });

  test("a short target suggests the expanding style", () => {
    expect(decideRegenRoute(input({ target: { length: 200, }, },),),).toEqual({ decision: "style", style: "longer", },);
  });

  test("a mid-sized target suggests a plain re-roll", () => {
    expect(decideRegenRoute(input({ target: { length: 201, }, },),),).toEqual({ decision: "reroll", },);
    expect(decideRegenRoute(input({ target: { length: 1199, }, },),),).toEqual({ decision: "reroll", },);
  });
});
