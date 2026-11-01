import { afterAll, afterEach, beforeEach, expect, mock, test, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../../../test-utils/isolate-only";
import { installBattleDom, } from "../../tests/battle-fake-dom";
import type { NsfwFetchResult, } from "../nsfw-panel/api";
import type { ArousalRow, } from "./api";
import { bodyStateState, toBodyStateView, } from "./state";

// ── Mock ../htmx (must precede importing ./state) ──
type ApiFetchMock = (url: string, opts?: RequestInit,) => Promise<Response>;
let calls: string[] = [];
let handler: ApiFetchMock = async () => Response.json({},);

if (ISOLATED) {
  mock.module("../htmx", () => ({
    apiFetch: (async (url: string, opts?: RequestInit,) => {
      calls.push(url,);
      return handler(url, opts,);
    }) satisfies ApiFetchMock,
  }),);
}

// mountBodyState renders the widget DOM — install the battle fake DOM and
// restore the i18n catalog sentinel-style (see battle/health-bar.test.ts).
const localeStringsHost = globalThis as { __localeStrings?: unknown };
const initialLocaleStrings = localeStringsHost.__localeStrings;
let restoreDom: () => void;

beforeEach(() => {
  restoreDom = installBattleDom();
},);

afterEach(() => {
  restoreDom();
},);

afterAll(() => {
  localeStringsHost.__localeStrings = initialLocaleStrings;
},);

interface BodyCtx {
  activeChat: string | null;
  _bodyStateView: unknown;
  $refs?: { bodyStatePanel?: { children: unknown[]; replaceChildren(): void; append(el: unknown,): void } };
  loadBodyState: () => Promise<void>;
  mountBodyState: () => void;
}

/** A fake mount slot recording what the mixin rendered. */
function makeSlot(): { children: unknown[]; replaceChildren(): void; append(el: unknown,): void } {
  const slot: { children: unknown[]; replaceChildren(): void; append(el: unknown,): void } = {
    children: [],
    replaceChildren() {
      slot.children = [];
    },
    append(el: unknown,) {
      slot.children.push(el,);
    },
  };

  return slot;
}

function buildCtx(overrides?: Partial<BodyCtx>,): BodyCtx {
  const slot = makeSlot();
  const ctx: BodyCtx = {
    activeChat: "chat-1",
    _bodyStateView: null,
    $refs: { bodyStatePanel: slot, },
    loadBodyState: async () => {},
    mountBodyState: () => {},
    ...overrides,
  };

  ctx.loadBodyState = () => bodyStateState.loadBodyState!.call(ctx as never,) as Promise<void>;
  ctx.mountBodyState = () => bodyStateState.mountBodyState!.call(ctx as never,) as void;
  return ctx;
}

/** Route the three endpoints the mixin touches; unhandled URLs 404. */
function routeResponses(opts?: {
  characterId?: string | null;
  worldId?: string | null;
  stats?: unknown;
  arousal?: unknown;
  statsStatus?: number;
  arousalStatus?: number;
  chatStatus?: number;
},): void {
  handler = async (url,) => {
    if (url.includes("/api/v1/chats/",)) {
      if (opts?.chatStatus && opts.chatStatus !== 200) {
        return new Response("nope", { status: opts.chatStatus, },);
      }

      return Response.json({ character_id: opts?.characterId ?? null, world_id: opts?.worldId ?? null, },);
    }

    if (url.includes("/rpg/stats/",)) {
      if (opts?.statsStatus && opts.statsStatus !== 200) {
        return new Response("nope", { status: opts.statsStatus, },);
      }

      return Response.json(opts?.stats ?? { hp: 10, maxHp: 20, conditions: "[]", },);
    }

    if (url.includes("/nsfw/arousal/",)) {
      if (opts?.arousalStatus && opts.arousalStatus !== 200) {
        return new Response("nope", { status: opts.arousalStatus, },);
      }

      return Response.json(opts?.arousal ?? { level: 0, },);
    }

    return new Response("not found", { status: 404, },);
  };
}

afterEach(() => {
  calls = [];
  handler = async () => Response.json({},);
},);

describeOrSkip("toBodyStateView", () => {
  const ok = <T,>(data: T,): NsfwFetchResult<T> => ({ status: "ok", data, });

  test("maps stats and arousal onto the widget view", () => {
    const view = toBodyStateView(
      ok({ hp: 12, maxHp: 30, conditions: '[{"name":"Poisoned","source":"snake","duration_rounds":3}]', },),
      ok({ level: 65, },),
    );

    expect(view,).toEqual({
      health: { hp: 12, maxHp: 30, },
      arousal: { level: 65, },
      conditions: [{ id: "poisoned", name: "Poisoned", source: "snake", durationTurns: 3, },],
    },);
  });

  test("returns null when both fetches failed", () => {
    expect(toBodyStateView({ status: "failed", }, { status: "failed", },),).toBeNull();
  });

  test("drops the arousal row on denial but keeps health and conditions", () => {
    const view = toBodyStateView(ok({ hp: 5, maxHp: 10, conditions: "[]", },), { status: "denied", },);
    expect(view,).toEqual({ health: { hp: 5, maxHp: 10, }, arousal: null, conditions: [], },);
  });

  test("keeps the arousal row when the stats fetch fails", () => {
    const view = toBodyStateView({ status: "failed", }, ok({ level: 30, },),);
    expect(view,).toEqual({ health: null, arousal: { level: 30, }, conditions: [], },);
  });

  test("ignores a non-numeric arousal level", () => {
    expect(toBodyStateView({ status: "failed", }, ok({ level: "high", } as unknown as ArousalRow,),),).toBeNull();
  });
},);

describeOrSkip("loadBodyState", () => {
  test("resolves the character and mounts the widget", async () => {
    routeResponses({
      characterId: "actor-1",
      worldId: "world-1",
      stats: { hp: 8, maxHp: 20, conditions: '[{"name":"Poisoned"}]', },
      arousal: { level: 10, },
    },);

    const ctx = buildCtx();
    await ctx.loadBodyState();

    expect(calls,).toContain("/api/v1/chats/chat-1",);
    expect(calls,).toContain("/api/v1/rpg/stats/actor-1",);
    expect(calls,).toContain("/api/v1/nsfw/arousal/actor-1?worldId=world-1",);
    expect(ctx._bodyStateView,).toEqual({
      health: { hp: 8, maxHp: 20, },
      arousal: { level: 10, },
      conditions: [{ id: "poisoned", name: "Poisoned", source: null, durationTurns: null, },],
    },);

    expect(ctx.$refs!.bodyStatePanel!.children,).toHaveLength(1,);
  });

  test("passes no world query when the chat has no world", async () => {
    routeResponses({ characterId: "actor-1", worldId: null, },);
    const ctx = buildCtx();
    await ctx.loadBodyState();
    expect(calls,).toContain("/api/v1/nsfw/arousal/actor-1?",);
  });

  test("clears the slot when the chat has no character", async () => {
    routeResponses({ characterId: null, },);
    const ctx = buildCtx({ _bodyStateView: { health: { hp: 1, maxHp: 1, }, arousal: null, conditions: [], }, },);
    await ctx.loadBodyState();

    expect(ctx._bodyStateView,).toBeNull();
    expect(ctx.$refs!.bodyStatePanel!.children,).toHaveLength(0,);
  });

  test("clears the slot when there is no active chat", async () => {
    const ctx = buildCtx({
      activeChat: null,
      _bodyStateView: { health: { hp: 1, maxHp: 1, }, arousal: null, conditions: [], },
    },);

    await ctx.loadBodyState();

    expect(ctx._bodyStateView,).toBeNull();
    expect(ctx.$refs!.bodyStatePanel!.children,).toHaveLength(0,);
  });

  test("clears the slot when the chat fetch fails", async () => {
    routeResponses({ chatStatus: 500, },);
    const ctx = buildCtx();
    await ctx.loadBodyState();

    expect(ctx._bodyStateView,).toBeNull();
    expect(ctx.$refs!.bodyStatePanel!.children,).toHaveLength(0,);
  });

  test("mounts nothing when every section is unavailable", async () => {
    routeResponses({ characterId: "actor-1", statsStatus: 404, arousalStatus: 403, },);
    const ctx = buildCtx();
    await ctx.loadBodyState();

    expect(ctx._bodyStateView,).toBeNull();
    expect(ctx.$refs!.bodyStatePanel!.children,).toHaveLength(0,);
  });

  test("discards a stale load when the chat switches mid-flight", async () => {
    routeResponses({ characterId: "actor-1", stats: { hp: 3, maxHp: 4, conditions: "[]", }, arousal: { level: 5, }, },);
    const ctx = buildCtx();
    const load = ctx.loadBodyState();

    // The user selects chat B while A's request is still open.
    ctx.activeChat = "chat-b";
    await load;
    expect(ctx._bodyStateView,).toBeNull();
  });

  test("mountBodyState without a slot is a no-op", () => {
    const ctx = buildCtx();
    ctx.$refs = undefined;
    expect(() => ctx.mountBodyState()).not.toThrow();
  });
},);
