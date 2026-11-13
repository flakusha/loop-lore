// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { describe, expect, it, } from "bun:test";
import { parseAttackPreview, } from "./api.js";

/** A `/api/battle/resolution/attack` success body (result spread + meta). */
function body(overrides: Record<string, unknown> = {},): unknown {
  return {
    roll: { results: [8, 15,], keptIdx: 1, total: 17, criticalSuccess: false, criticalFailure: false, modifiers: [], },
    hit: true,
    criticalHit: false,
    criticalMiss: false,
    narration: "Hit! Roll: 17 vs AC 15",
    meta: { version: "1", },
    ...overrides,
  };
}

describe("parseAttackPreview", () => {
  it("parses the kept natural die, total, and outcome", () => {
    const preview = parseAttackPreview(body(), 15,);
    expect(preview,).toEqual({
      natural: 15,
      total: 17,
      targetAC: 15,
      hit: true,
      criticalHit: false,
      criticalMiss: false,
      outcome: "success",
    },);
  });

  it("maps a miss to the failure outcome", () => {
    const preview = parseAttackPreview(body({ hit: false, },), 25,);
    expect(preview?.outcome,).toBe("failure",);
    expect(preview?.hit,).toBe(false,);
  });

  it("defaults keptIdx to the first result when absent", () => {
    const payload = body();
    (payload as { roll: Record<string, unknown> }).roll = {
      results: [12,],
      total: 14,
      criticalSuccess: false,
      criticalFailure: false,
      modifiers: [],
    };

    expect(parseAttackPreview(payload, 15,)?.natural,).toBe(12,);
  });

  it("returns null for a non-object, roll-less, or non-boolean-hit payload", () => {
    expect(parseAttackPreview(null, 15,),).toBeNull();
    expect(parseAttackPreview("nope", 15,),).toBeNull();
    expect(parseAttackPreview({ hit: true, }, 15,),).toBeNull();
    expect(parseAttackPreview({ roll: { results: [1,], total: 3, }, }, 15,),).toBeNull();
  });
});
