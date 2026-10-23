// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the pending-ASI panel slice of `rpgStats` (F2).
 *
 * Mirrors chat-participants.test.ts: mocks `./htmx` apiFetch, builds a
 * minimal ctx from the `rpgStats` slice, invokes the action methods, and
 * asserts on the request shape plus state transitions.
 *
 * Pins the contract:
 *   - loadRpgStats maps pendingAsi from the stats payload (and the success
 *     mapping is not clobbered by the defaults fallback)
 *   - allocateAsi POSTs /api/v1/rpg/progression/:actorId/asi with
 *     { ability, points: 2 } and reloads stats
 *   - resolveLevelUpAuto POSTs .../level-up with { kind: "auto" } and
 *     reloads stats
 *   - failures surface on rpgAsiError without reloading
 */
import "./i18n.test-helper";
import { afterEach, expect, mock, test, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../../test-utils/isolate-only";
import { rpgStats, } from "./rpg-stats";
import type { ChatState, } from "./types";

let fetchCalls: { url: string; opts: RequestInit }[] = [];
let fetchHandler: ((url: string, opts: RequestInit,) => Response) | null = null;

if (ISOLATED) {
  mock.module("./htmx", () => ({
    apiFetch: async (url: string, opts?: RequestInit,) => {
      fetchCalls.push({ url, opts: opts ?? {}, },);
      if (!fetchHandler) { return new Response("{}", { status: 200, },); }
      return fetchHandler(url, opts ?? {},);
    },
  }),);
}

afterEach(() => {
  fetchCalls = [];
  fetchHandler = null;
},);

function buildCtx(overrides: Record<string, unknown> = {},): ChatState {
  const base: Record<string, unknown> = {
    activeChat: "chat-1",
    rpgStats: null,
    statusEffects: [],
    equipment: [],
    _rpgActorId: null,
    rpgAsiBusy: false,
    rpgAsiError: null,
    ...rpgStats,
    ...overrides,
  };

  return base as unknown as ChatState;
}

const STATS_PAYLOAD = {
  level: 4,
  hp: 30,
  maxHp: 30,
  mp: 10,
  maxMp: 10,
  ac: 12,
  speed: 10,
  xp: 2700,
  xpToNext: 800,
  pendingAsi: 2,
  str: 10,
  dex: 10,
  con: 10,
  int: 10,
  wis: 10,
  cha: 10,
  conditions: "[]",
  activeEffects: "[]",
};

/** Route each apiFetch call by URL: chats lookup, then the payload. */
function mockLoad(payload: unknown = STATS_PAYLOAD,): void {
  fetchHandler = (url,) => {
    if (url === "/api/v1/chats/chat-1") {
      return Response.json({ character_id: "actor-1", }, { status: 200, },);
    }

    return Response.json(payload, { status: 200, },);
  };
}

describeOrSkip("rpgStats pendingAsi mapping", () => {
  test("loadRpgStats maps pendingAsi and keeps the success mapping", async () => {
    mockLoad();
    const ctx = buildCtx();
    await rpgStats.loadRpgStats!.call(ctx,);
    expect(ctx.rpgStats?.pendingAsi,).toBe(2,);
    expect(ctx.rpgStats?.str,).toBe(10,);
    expect(ctx._rpgActorId,).toBe("actor-1",);
  });

  test("loadRpgStats defaults pendingAsi to 0 when the payload omits it", async () => {
    const withoutAsi = { ...STATS_PAYLOAD, pendingAsi: undefined as unknown as number, };
    mockLoad(withoutAsi,);
    const ctx = buildCtx();
    await rpgStats.loadRpgStats!.call(ctx,);
    expect(ctx.rpgStats?.pendingAsi,).toBe(0,);
  });
},);

/** Minimal full-shape stats for spend tests (budget is the only live field). */
function spendStats(): ChatState["rpgStats"] {
  return {
    level: 4,
    hp: 30,
    maxHp: 30,
    mp: 10,
    maxMp: 10,
    ac: 12,
    initiative: 0,
    xp: 2700,
    xpToNext: 800,
    pendingAsi: 2,
    str: 10,
    dex: 10,
    con: 10,
    int: 10,
    wis: 10,
    cha: 10,
  };
}

describeOrSkip("rpgStats.allocateAsi", () => {
  test("POSTs {ability, points:2} to the asi endpoint and reloads", async () => {
    mockLoad();

    const ctx = buildCtx({ _rpgActorId: "actor-1", rpgStats: spendStats(), },);
    await rpgStats.allocateAsi!.call(ctx, "str",);
    const posted = fetchCalls.find((c,) => c.url.endsWith("/asi",));
    expect(posted?.url,).toBe("/api/v1/rpg/progression/actor-1/asi",);
    expect(JSON.parse(posted?.opts.body as string,),).toEqual({ ability: "str", points: 2, },);
    expect(ctx.rpgStats?.pendingAsi,).toBe(2,);
    expect(ctx.rpgAsiError,).toBeNull();
    expect(ctx.rpgAsiBusy,).toBe(false,);
  });

  test("failure surfaces on rpgAsiError without reloading", async () => {
    fetchHandler = () => {
      throw new Error("boom",);
    };

    const ctx = buildCtx({ _rpgActorId: "actor-1", rpgStats: spendStats(), },);
    await rpgStats.allocateAsi!.call(ctx, "str",);
    expect(ctx.rpgAsiError,).toBe("Failed to allocate ability points",);
    expect(ctx.rpgAsiBusy,).toBe(false,);
    expect(ctx.rpgStats,).toEqual(spendStats(),);
  });

  test("HTTP 400 surfaces the server message without reloading", async () => {
    fetchHandler = () => Response.json({ error: "No pending ASI to allocate", }, { status: 400, },);

    const ctx = buildCtx({ _rpgActorId: "actor-1", rpgStats: spendStats(), },);
    await rpgStats.allocateAsi!.call(ctx, "str",);
    expect(ctx.rpgAsiError,).toBe("No pending ASI to allocate",);
    expect(ctx.rpgAsiBusy,).toBe(false,);
    expect(ctx.rpgStats,).toEqual(spendStats(),);
  });

  test("HTTP 400 with an empty body falls back to the default message", async () => {
    fetchHandler = () => new Response("", { status: 400, },);

    const ctx = buildCtx({ _rpgActorId: "actor-1", rpgStats: spendStats(), },);
    await rpgStats.allocateAsi!.call(ctx, "str",);
    expect(ctx.rpgAsiError,).toBe("Failed to allocate ability points",);
    expect(ctx.rpgStats,).toEqual(spendStats(),);
  });

  test("no-op without a resolved actor id", async () => {
    const ctx = buildCtx({ _rpgActorId: null, },);
    await rpgStats.allocateAsi!.call(ctx, "str",);
    expect(fetchCalls,).toHaveLength(0,);
  });
},);

describeOrSkip("rpgStats.resolveLevelUpAuto", () => {
  test("POSTs {kind:auto} to the level-up endpoint and reloads", async () => {
    mockLoad();
    const ctx = buildCtx({ _rpgActorId: "actor-1", rpgStats: spendStats(), },);
    await rpgStats.resolveLevelUpAuto!.call(ctx,);
    const posted = fetchCalls.find((c,) => c.url.endsWith("/level-up",));
    expect(posted?.url,).toBe("/api/v1/rpg/progression/actor-1/level-up",);
    expect(JSON.parse(posted?.opts.body as string,),).toEqual({ kind: "auto", },);
    expect(ctx.rpgStats?.pendingAsi,).toBe(2,);
    expect(ctx.rpgAsiError,).toBeNull();
    expect(ctx.rpgAsiBusy,).toBe(false,);
  });

  test("failure surfaces on rpgAsiError without reloading", async () => {
    fetchHandler = () => {
      throw new Error("boom",);
    };

    const ctx = buildCtx({ _rpgActorId: "actor-1", rpgStats: spendStats(), },);
    await rpgStats.resolveLevelUpAuto!.call(ctx,);
    expect(ctx.rpgAsiError,).toBe("Failed to resolve level-up",);
    expect(ctx.rpgAsiBusy,).toBe(false,);
    expect(ctx.rpgStats,).toEqual(spendStats(),);
  });

  test("HTTP 400 surfaces the server message without reloading", async () => {
    fetchHandler = () => Response.json({ error: "No pending level-up to resolve", }, { status: 400, },);

    const ctx = buildCtx({ _rpgActorId: "actor-1", rpgStats: spendStats(), },);
    await rpgStats.resolveLevelUpAuto!.call(ctx,);
    expect(ctx.rpgAsiError,).toBe("No pending level-up to resolve",);
    expect(ctx.rpgAsiBusy,).toBe(false,);
    expect(ctx.rpgStats,).toEqual(spendStats(),);
  });

  test("no-op without a resolved actor id", async () => {
    const ctx = buildCtx({ _rpgActorId: null, },);
    await rpgStats.resolveLevelUpAuto!.call(ctx,);
    expect(fetchCalls,).toHaveLength(0,);
  });

  test("no-op while another spend is in flight", async () => {
    const ctx = buildCtx({ _rpgActorId: "actor-1", rpgAsiBusy: true, },);
    await rpgStats.resolveLevelUpAuto!.call(ctx,);
    expect(fetchCalls,).toHaveLength(0,);
  });
},);

describeOrSkip("rpgStats.loadRpgStats fallbacks", () => {
  test("clears stats when no chat is active", async () => {
    const ctx = buildCtx({ activeChat: null, rpgStats: spendStats(), },);
    await rpgStats.loadRpgStats!.call(ctx,);
    expect(ctx.rpgStats,).toBeNull();
    expect(fetchCalls,).toHaveLength(0,);
  });

  test("clears stats when the chat lookup fails", async () => {
    fetchHandler = () => new Response("nope", { status: 500, },);
    const ctx = buildCtx({ rpgStats: spendStats(), },);
    await rpgStats.loadRpgStats!.call(ctx,);
    expect(ctx.rpgStats,).toBeNull();
  });

  test("clears stats when the chat has no character", async () => {
    fetchHandler = () => Response.json({ id: "chat-1", }, { status: 200, },);
    const ctx = buildCtx({ rpgStats: spendStats(), },);
    await rpgStats.loadRpgStats!.call(ctx,);
    expect(ctx.rpgStats,).toBeNull();
  });

  test("falls back to defaults when stats are unavailable", async () => {
    fetchHandler = (url,) => {
      if (url === "/api/v1/chats/chat-1") {
        return Response.json({ character_id: "actor-1", }, { status: 200, },);
      }

      return new Response("nope", { status: 404, },);
    };

    const ctx = buildCtx();
    await rpgStats.loadRpgStats!.call(ctx,);
    expect(ctx.rpgStats?.level,).toBe(1,);
    expect(ctx.rpgStats?.hp,).toBe(12,);
    expect(ctx.rpgStats?.maxHp,).toBe(12,);
    expect(ctx.rpgStats?.mp,).toBe(8,);
    expect(ctx.rpgStats?.maxMp,).toBe(8,);
    expect(ctx.rpgStats?.ac,).toBe(12,);
    expect(ctx.rpgStats?.initiative,).toBe(0,);
    expect(ctx.rpgStats?.xp,).toBe(0,);
    expect(ctx.rpgStats?.xpToNext,).toBe(100,);
    expect(ctx.rpgStats?.pendingAsi,).toBe(0,);
    expect(ctx.rpgStats?.str,).toBe(10,);
    expect(ctx.rpgStats?.cha,).toBe(10,);
    expect(ctx.statusEffects,).toEqual([],);
    expect(ctx.equipment,).toHaveLength(8,);
  });

  test("falls back to defaults when the request throws", async () => {
    fetchHandler = () => {
      throw new Error("offline",);
    };

    const ctx = buildCtx();
    await rpgStats.loadRpgStats!.call(ctx,);
    expect(ctx.rpgStats?.level,).toBe(1,);
    expect(ctx.statusEffects,).toEqual([],);
    expect(ctx.equipment,).toHaveLength(8,);
  });
},);

describeOrSkip("rpgStats payload mapping", () => {
  test("maps missing numeric fields to defaults and derives initiative", async () => {
    mockLoad({ level: 7, speed: 16, },);
    const ctx = buildCtx();
    await rpgStats.loadRpgStats!.call(ctx,);
    expect(ctx.rpgStats?.level,).toBe(7,);
    expect(ctx.rpgStats?.initiative,).toBe(3,);
    expect(ctx.rpgStats?.hp,).toBe(0,);
    expect(ctx.rpgStats?.maxHp,).toBe(0,);
    expect(ctx.rpgStats?.mp,).toBe(0,);
    expect(ctx.rpgStats?.maxMp,).toBe(0,);
    expect(ctx.rpgStats?.ac,).toBe(10,);
    expect(ctx.rpgStats?.xp,).toBe(0,);
    expect(ctx.rpgStats?.xpToNext,).toBe(100,);
    expect(ctx.rpgStats?.dex,).toBe(10,);
  });

  test("initiative is zero when speed is missing", async () => {
    mockLoad({ level: 2, },);
    const ctx = buildCtx();
    await rpgStats.loadRpgStats!.call(ctx,);
    expect(ctx.rpgStats?.initiative,).toBe(0,);
  });

  test("parses conditions into status effects", async () => {
    mockLoad({
      conditions: JSON.stringify([
        { name: "Poisoned", source: "snake", duration_rounds: 3, },
        { name: "Blessed", duration_rounds: 5, },
      ],),
      activeEffects: "[]",
    },);

    const ctx = buildCtx();
    await rpgStats.loadRpgStats!.call(ctx,);
    expect(ctx.statusEffects,).toHaveLength(2,);
    expect(ctx.statusEffects[0]?.id,).toBe("poisoned",);
    expect(ctx.statusEffects[0]?.name,).toBe("Poisoned",);
    expect(ctx.statusEffects[0]?.description,).toBe("Source: snake",);
    expect(ctx.statusEffects[0]?.duration,).toBe(3,);
    expect(ctx.statusEffects[0]?.modifier,).toEqual({},);
    expect(ctx.statusEffects[1]?.id,).toBe("blessed",);
    expect(ctx.statusEffects[1]?.description,).toBe("",);
    expect(ctx.statusEffects[1]?.duration,).toBe(5,);
  });

  test("ignores malformed conditions and active effects", async () => {
    mockLoad({ conditions: "not json", activeEffects: "{{{", },);
    const ctx = buildCtx();
    await rpgStats.loadRpgStats!.call(ctx,);
    expect(ctx.statusEffects,).toEqual([],);
    expect(ctx.equipment,).toHaveLength(8,);
  });

  test("keeps default equipment slots for buff and debuff effects", async () => {
    mockLoad({
      conditions: "[]",
      activeEffects: JSON.stringify([
        { name: "Haste", type: "buff", },
        { name: "Slow", type: "debuff", },
      ],),
    },);

    const ctx = buildCtx();
    await rpgStats.loadRpgStats!.call(ctx,);
    expect(ctx.equipment,).toHaveLength(8,);
    expect(ctx.equipment.every((slot,) => slot.itemId === null),).toBe(true,);
  });
},);

describeOrSkip("rpgStats modifiers", () => {
  test("getModifier floors the D&D modifier", () => {
    expect(rpgStats.getModifier!(10,),).toBe(0,);
    expect(rpgStats.getModifier!(11,),).toBe(0,);
    expect(rpgStats.getModifier!(12,),).toBe(1,);
    expect(rpgStats.getModifier!(3,),).toBe(-4,);
  });

  test("effectiveStat sums every modifier of every effect", () => {
    expect(rpgStats.effectiveStat!(10, [],),).toBe(10,);
    expect(
      rpgStats.effectiveStat!(10, [
        { id: "a", name: "A", description: "", duration: -1, modifier: { str: 2, dex: -1, }, },
        { id: "b", name: "B", description: "", duration: 1, modifier: { con: 3, }, },
      ],),
    ).toBe(14,);

    expect(
      rpgStats.effectiveStat!(10, [
        { id: "a", name: "A", description: "", duration: -1, modifier: {}, },
      ],),
    ).toBe(10,);
  });
},);
