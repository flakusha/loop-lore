// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterEach, expect, mock, test, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../../test-utils/isolate-only";
import { statAllocation, statAllocationFactory, type StatAllocationState, } from "./stat-allocation";

type ApiFetchMock = (url: string, opts?: RequestInit,) => Promise<Response>;
let calls: { url: string; opts: RequestInit }[] = [];
let handler: ApiFetchMock = async () => Response.json([],);

if (ISOLATED) {
  mock.module("./htmx", () => ({
    apiFetch: ((url: string, opts?: RequestInit,) => {
      calls.push({ url, opts: opts ?? {}, },);
      return handler(url, opts,);
    }) satisfies ApiFetchMock,
  }),);
}

const baseCtx = (): StatAllocationState => {
  const state = Object.create(statAllocation,) as StatAllocationState;
  state._saActorId = null;
  state._saWorldId = "";
  state.stats = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, };
  state.statMin = 8;
  state.statMax = 15;
  state.budget = 27;
  state.pointBuyCost = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9, };
  state.catalog = [];
  state.selectedTraits = [];
  state.loading = false;
  state.saving = false;
  state.error = "";
  state.message = "";
  return state;
};

afterEach(() => {
  calls = [];
  handler = async () => Response.json([],);
},);

describeOrSkip("statAllocation.setBinding", () => {
  test("binds and resets draft state", () => {
    const ctx = baseCtx();
    ctx.setBinding("actor-1", "world-1",);
    expect(ctx._saActorId,).toBe("actor-1",);
    expect(ctx._saWorldId,).toBe("world-1",);
    expect(ctx.selectedTraits,).toEqual([],);
  });
},);

describeOrSkip("statAllocation.budget", () => {
  test("remaining uses point-buy costs (matches server table)", () => {
    const ctx = baseCtx();
    ctx.stats = { str: 15, dex: 14, con: 13, int: 12, wis: 10, cha: 8, };
    // 9 + 7 + 5 + 4 + 2 + 0 = 27 — exactly the default budget
    expect(ctx.budgetRemaining(),).toBe(0,);
    ctx.stats = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, };
    // 2 * 6 = 12
    expect(ctx.budgetRemaining(),).toBe(27 - 12,);
  });

  test("nudge clamps to min/max", () => {
    const ctx = baseCtx();
    ctx.nudge("str", -100,);
    expect(ctx.stats.str,).toBe(8,);
    ctx.nudge("str", 100,);
    expect(ctx.stats.str,).toBe(15,);
  });

  test("modifier matches floor((stat-10)/2)", () => {
    const ctx = baseCtx();
    ctx.stats.str = 14;
    expect(ctx.modifier("str",),).toBe(2,);
    ctx.stats.str = 8;
    expect(ctx.modifier("str",),).toBe(-1,);
  });
},);

describeOrSkip("statAllocation.toggleTrait", () => {
  test("adds and removes", () => {
    const ctx = baseCtx();
    ctx.toggleTrait("fast_reflexes",);
    expect(ctx.selectedTraits,).toEqual(["fast_reflexes",],);
    ctx.toggleTrait("fast_reflexes",);
    expect(ctx.selectedTraits,).toEqual([],);
  });
},);

describeOrSkip("statAllocation.loadConfig", () => {
  test("applies server bounds and cost table", async () => {
    const ctx = baseCtx();
    ctx.setBinding("actor-1", "world-custom",);
    handler = async (url: string,) => {
      if (url.includes("/stat-config",)) {
        return Response.json({
          requiresStats: 1,
          statPointBudget: 20,
          statMin: 6,
          statMax: 14,
          pointBuyCost: { 6: 0, 7: 1, 14: 9, },
        },);
      }

      return Response.json([],);
    };

    await ctx.loadConfig("world-custom",);

    expect(ctx.budget,).toBe(20,);
    expect(ctx.statMin,).toBe(6,);
    expect(ctx.statMax,).toBe(14,);
    expect(ctx.pointBuyCost[14],).toBe(9,);
  });

  test("surfaces config load failure", async () => {
    const ctx = baseCtx();
    handler = async () => new Response("nope", { status: 500, },);

    await ctx.loadConfig("world-missing",);

    expect(ctx.error,).not.toBe("",);
  });
},);

describeOrSkip("statAllocation.save", () => {
  test("PUTs worldId + stats + traitIds and surfaces server error", async () => {
    const ctx = baseCtx();
    ctx.setBinding("actor-1", "world-1",);
    handler = async (url: string,) => {
      if (url.includes("/stat-allocation/",)) {
        return new Response(JSON.stringify({ error: "Point-buy cost 99 exceeds budget 27", },), { status: 422, },);
      }

      return Response.json([],);
    };

    await ctx.save();

    expect(calls.some((call,) => call.url.includes("/api/v1/rpg/stat-allocation/actor-1",)),).toBe(true,);
    expect(ctx.error,).toContain("exceeds budget",);
  });
},);

describeOrSkip("statAllocationFactory", () => {
  test("binds actor + world", () => {
    const state = statAllocationFactory("actor-9", "world-9",);
    expect(state._saActorId,).toBe("actor-9",);
    expect(state._saWorldId,).toBe("world-9",);
  });
},);
