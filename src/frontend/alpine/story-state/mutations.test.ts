import { afterEach, expect, mock, test, } from "bun:test";
import { describeOrSkip, ISOLATED, } from "../../../test-utils/isolate-only";
import { mutations, npcPatchFromDraft, } from "./mutations";
import type { NpcStateRow, StoryStateComponent, } from "./types";

// ── Mock ../htmx (must override the real one set by htmx.ts at import) ──
let fetchCalls: { url: string; opts: RequestInit }[] = [];
let fetchHandler: ((url: string, opts: RequestInit,) => Response) | null = null;

if (ISOLATED) {
  mock.module("../htmx", () => ({
    apiFetch: async (url: string, opts?: RequestInit,) => {
      fetchCalls.push({ url, opts: opts ?? {}, },);
      if (!fetchHandler) { return new Response("{}", { status: 200, },); }
      return fetchHandler(url, opts ?? {},);
    },
  }),);
}

/** Build a component-like context for the mutation methods. */
function buildCtx(
  overrides: Partial<Record<string, unknown>> = {},
): StoryStateComponent {
  const toasts: { message: string; type?: string }[] = [];
  const base: Record<string, unknown> = {
    _worldId: "world-1",
    chatId: "chat-1",
    worldStates: [],
    worldStatesTotal: 0,
    npcState: null,
    npcStateActorId: null,
    npcDraft: { health: "", mentalState: "", locationId: "", },
    turnDetail: null,
    turnDetailLoading: false,
    notify: (message: string, type?: string,) => {
      toasts.push({ message, type, },);
    },
    ...mutations,
    ...overrides,
  };

  (base as { toasts?: unknown }).toasts = toasts;
  return base as unknown as StoryStateComponent;
}

const NPC_ROW: NpcStateRow = {
  id: "row-1",
  actor_id: "npc-1",
  world_id: "world-1",
  location_id: null,
  health: 65,
  mental_state: "resting",
  knowledge: "",
  relationships: "",
  schedule: "",
  updated_at: "2026-01-01T00:00:00Z",
};

describeOrSkip("npcPatchFromDraft", () => {
  test("includes only changed, non-empty fields", () => {
    const patch = npcPatchFromDraft(
      { health: "70", mentalState: " angry ", locationId: "loc-9", },
      { health: 65, mentalState: "resting", locationId: null, },
    );

    expect(patch,).toEqual({ health: 70, mentalState: "angry", locationId: "loc-9", },);
  });

  test("omits unchanged and unparseable fields", () => {
    const patch = npcPatchFromDraft(
      { health: "", mentalState: "resting", locationId: "loc-9", },
      { health: 65, mentalState: "resting", locationId: "loc-9", },
    );

    expect(patch,).toEqual({},);
  });
},);

describeOrSkip("world-states mutations", () => {
  afterEach(() => {
    fetchHandler = null;
    fetchCalls = [];
  },);

  test("loadWorldStates populates the list and total", async () => {
    fetchHandler = (url,) =>
      url.includes("/states?",)
        ? Response.json({ data: [{ id: "ws-1", },], total: 1, },)
        : new Response("{}", { status: 404, },);

    const ctx = buildCtx();
    await ctx.loadWorldStates();
    expect(ctx.worldStates.map((s,) => s.id),).toEqual(["ws-1",],);
    expect(ctx.worldStatesTotal,).toBe(1,);
  });

  test("addWorldState posts and refreshes the list", async () => {
    fetchHandler = (url, opts,) => {
      if (opts.method === "POST") { return Response.json({ id: "ws-2", },); }
      if (url.includes("/states?",)) { return Response.json({ data: [{ id: "ws-2", },], total: 1, },); }
      return new Response("{}", { status: 404, },);
    };

    const ctx = buildCtx();
    await ctx.addWorldState("  snapshot  ",);
    expect(ctx.worldStates.map((s,) => s.id),).toEqual(["ws-2",],);
    expect((ctx as unknown as { toasts: { type?: string }[] }).toasts[0]?.type,).toBeUndefined();
  });

  test("addWorldState failure notifies without refreshing", async () => {
    fetchHandler = () => new Response("{}", { status: 404, },);
    const ctx = buildCtx();
    await ctx.addWorldState("snapshot",);
    const toasts = (ctx as unknown as { toasts: { type?: string }[] }).toasts;
    expect(toasts[0]?.type,).toBe("error",);
    expect(ctx.worldStates,).toEqual([],);
  });

  test("addWorldState ignores blank descriptions", async () => {
    const ctx = buildCtx();
    await ctx.addWorldState("   ",);
    expect(fetchCalls.length,).toBe(0,);
  });
},);

describeOrSkip("npc-state mutations", () => {
  afterEach(() => {
    fetchHandler = null;
    fetchCalls = [];
  },);

  test("loadNpcState seeds the edit draft", async () => {
    fetchHandler = (url,) =>
      url.includes("/npc-states/",) ? Response.json(NPC_ROW,) : new Response("{}", { status: 404, },);

    const ctx = buildCtx();
    await ctx.loadNpcState("npc-1",);
    expect(ctx.npcStateActorId,).toBe("npc-1",);
    expect(ctx.npcDraft,).toEqual({ health: "65", mentalState: "resting", locationId: "", },);
  });

  test("saveNpcState applies optimistically then adopts the written row", async () => {
    fetchHandler = (_url, opts,) =>
      opts.method === "PUT"
        ? Response.json({ data: { ...NPC_ROW, health: 70, }, },)
        : new Response("{}", { status: 404, },);

    const ctx = buildCtx({
      npcState: NPC_ROW,
      npcStateActorId: "npc-1",
      npcDraft: { health: "70", mentalState: "resting", locationId: "", },
    },);

    await ctx.saveNpcState();
    expect(ctx.npcState?.health,).toBe(70,);
  });

  test("saveNpcState reverts the optimistic write on failure", async () => {
    fetchHandler = () => new Response("{}", { status: 500, },);
    const ctx = buildCtx({
      npcState: NPC_ROW,
      npcStateActorId: "npc-1",
      npcDraft: { health: "70", mentalState: "resting", locationId: "", },
    },);

    await ctx.saveNpcState();
    expect(ctx.npcState?.health,).toBe(65,);
    const toasts = (ctx as unknown as { toasts: { type?: string }[] }).toasts;
    expect(toasts[0]?.type,).toBe("error",);
  });

  test("saveNpcState skips the request when nothing changed", async () => {
    const ctx = buildCtx({
      npcState: NPC_ROW,
      npcStateActorId: "npc-1",
      npcDraft: { health: "65", mentalState: "resting", locationId: "", },
    },);

    await ctx.saveNpcState();
    expect(fetchCalls.length,).toBe(0,);
  });
},);

describeOrSkip("turn-by-id mutation", () => {
  afterEach(() => {
    fetchHandler = null;
    fetchCalls = [];
  },);

  test("loadStoryTurn renders the detail view", async () => {
    fetchHandler = (url,) =>
      url.includes("/story-turns/turn-1",)
        ? Response.json({ id: "turn-1", turn_number: 3, prompt_sent: "hi", },)
        : new Response("{}", { status: 404, },);

    const ctx = buildCtx();
    await ctx.loadStoryTurn("turn-1",);
    expect(ctx.turnDetail?.id,).toBe("turn-1",);
    expect(ctx.turnDetailLoading,).toBe(false,);
  });

  test("loadStoryTurn notifies on a miss", async () => {
    fetchHandler = () => new Response("{}", { status: 404, },);
    const ctx = buildCtx();
    await ctx.loadStoryTurn("turn-x",);
    expect(ctx.turnDetail,).toBeNull();
    const toasts = (ctx as unknown as { toasts: { type?: string }[] }).toasts;
    expect(toasts[0]?.type,).toBe("error",);
  });
},);

describeOrSkip("canManageWorld gate", () => {
  afterEach(() => {
    delete (globalThis as { Alpine?: unknown }).Alpine;
    fetchHandler = null;
  },);

  test("allows admin and solo roles", () => {
    (globalThis as { Alpine?: unknown }).Alpine = {
      store: (n: string,) => (n === "ui" ? { userRole: "admin", } : {}),
    };

    expect(mutations.canManageWorld.call(buildCtx(),),).toBe(true,);
    (globalThis as { Alpine?: unknown }).Alpine = {
      store: (n: string,) => (n === "ui" ? { userRole: "solo", } : {}),
    };

    expect(mutations.canManageWorld.call(buildCtx(),),).toBe(true,);
  });

  test("denies regular roles", () => {
    (globalThis as { Alpine?: unknown }).Alpine = {
      store: (n: string,) => (n === "ui" ? { userRole: "member", } : {}),
    };

    expect(mutations.canManageWorld.call(buildCtx(),),).toBe(false,);
  });
},);
