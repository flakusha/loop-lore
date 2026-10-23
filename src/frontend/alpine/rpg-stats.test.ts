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
},);
