// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, beforeEach, describe, expect, it, test, } from "bun:test";
import { fetchAttackRollPreview, parseAttackPreview, } from "./api.js";

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

describe("fetchAttackRollPreview", () => {
  let originalFetch: typeof fetch;
  let handler: () => Response | Promise<Response>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    handler = () => Response.json({ roll: { results: [8, 15,], keptIdx: 1, total: 17, }, hit: true, },);
    globalThis.fetch = (async () => handler()) as typeof fetch;
  },);

  afterEach(() => {
    globalThis.fetch = originalFetch;
  },);

  test("returns the parsed preview on success", async () => {
    const preview = await fetchAttackRollPreview({ attackBonus: 2, targetAC: 15, },);
    expect(preview?.total,).toBe(17,);
  });

  test("returns null when the endpoint answers non-ok", async () => {
    handler = () => new Response("nope", { status: 500, },);
    await expect(fetchAttackRollPreview({ attackBonus: 2, targetAC: 15, },),).resolves.toBeNull();
  });

  test("returns null when the body is unusable", async () => {
    handler = () => Response.json({ nope: true, },);
    await expect(fetchAttackRollPreview({ attackBonus: 2, targetAC: 15, },),).resolves.toBeNull();
  });

  test("returns null when fetch throws", async () => {
    globalThis.fetch = (async () => {
      throw new Error("down",);
    }) as unknown as typeof fetch;

    await expect(fetchAttackRollPreview({ attackBonus: 2, targetAC: 15, },),).resolves.toBeNull();
  });
});
